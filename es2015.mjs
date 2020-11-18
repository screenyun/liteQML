import {JSClassIR, ClassIR} from './ir.mjs'
import {parseFunction, parseExpression} from './parser.mjs'


function isSymbol(type) {
    return type === 'Identifier' || type === 'MemberExpression';
}

function resolveSymbol(symbol, scope, thisObj) {
    let head = symbol.split(/[\.\[]/)[0];
    if(head != 'this') {
        if(!scope.has(head)) {
            if(thisObj.has(head))
                symbol = `this.${symbol}`;
            else
                console.log(`Referencing symbol ${head} defined outside scope`);
        }
    }
    return symbol;
}

export function translateCode(ast, scope, indent, thisObj) {
    let src = '';
    indent = indent? indent: 0;
    let indentStr = ' '.repeat(indent);
    if(scope == undefined)
        scope = new Set();
    if(Array.isArray(scope)) {
        scope = new Set(scope);
    }
    if(ast.type == 'BlockStatement') {
        let parentScope = new Set(scope);
        ast = ast.body;
        let advIndent = 4;

        if(ast.length <= 1)
            advIndent = 0;
        for(let stmt of ast) {
            src += translateCode(stmt, parentScope, indent+advIndent, thisObj)+'\n';
        }
        return (advIndent?`${indentStr}{\n`: '')+`${src}\n`+(advIndent?`${indentStr}}`:'');
    } else if(ast.type === 'IfStatement') {
        let test = translateCode(ast.test, scope, indent, thisObj);
        if(isSymbol(ast.test.type))
            test = resolveSymbol(test, scope, thisObj);
        let consequent = translateCode(ast.consequent, scope, indent, thisObj);
        if(isSymbol(ast.consequent.type))
            consequent = resolveSymbol(consequent, scope, thisObj);
        let alternate = '';
        if(ast.alternate) {
            let ret = translateCode(ast.alternate, scope, indent, thisObj).trim();
            if(isSymbol(ast.alternate))
                ret = resolveSymbol(ret, scope, thisObj);
            alternate = 'else '+ ret;
        }
        return `${indentStr}if (${test}) ${consequent.trim()} ${alternate}`
    } else if(ast.type === 'ExpressionStatement') {
        let expr = translateCode(ast.expression, scope, indent, thisObj);
        if(isSymbol(ast.expression.type))
            expr = resolveSymbol(expr, scope, thisObj);
        return `${indentStr}${expr};`;
    } else if (ast.type === 'VariableDeclaration') {
        
        let lst = []
        for(let decl of ast.declarations) {
            lst.push(translateCode(decl, scope, indent, thisObj));
        }
        return `${indentStr}let ${lst.join(', ')}`;
        
    } else if(ast.type === 'VariableDeclarator') {
        let init='';
        scope.add(ast.id.name);
        if(ast.init)
            init = '='+translateCode(ast.init, scope, indent, thisObj);
        return `${ast.id.name}${init}`;
    
    } else if(ast.type === 'ObjectExpression') {
        // TODO Finish this
        return '{}';
    } else if(ast.type === 'FunctionExpression') {
        let body = translateCode(ast.body, scope, indent, thisObj);
        return `function () ${body.trim()}`;
    } else if(ast.type === 'ForStatement') {
        let childScope = new Set(scope);
        let init = ast.init? translateCode(ast.init, childScope, 0, thisObj): '';
        let update = ast.update? translateCode(ast.update, childScope, 0, thisObj): '';
        let test = ast.test? translateCode(ast.test, childScope, 0, thisObj): '';
        
        let body = ast.body? translateCode(ast.body, childScope, indent+4, thisObj): '';

        return `${indentStr}for(${init}; ${test}; ${update})\n${body}`;
    } else if(ast.type === 'CallExpression') {
        let callee = translateCode(ast.callee, scope, indent, thisObj);
        // parameters
        let args = ast.arguments.map(x => {
            let ret = translateCode(x, scope, indent, thisObj);
            if(isSymbol(x.type))
                ret = resolveSymbol(ret, scope, thisObj);
            return ret;
        }).join(', ');
        return `${callee}(${args})`;
    } else if(ast.type === 'BinaryExpression') {
        let left = translateCode(ast.left, scope, indent, thisObj);
        let right = translateCode(ast.right, scope, indent, thisObj);
        if(isSymbol(ast.left.type))
            left = resolveSymbol(left, scope, thisObj);
        if(isSymbol(ast.right.type))
            right = resolveSymbol(right, scope, thisObj);

        return `${left} ${ast.operator} ${right}`;
    } else if (ast.type === 'AssignmentExpression') {
        let left = translateCode(ast.left, scope, indent, thisObj);
        let right = translateCode(ast.right, scope, indent, thisObj);
        if(isSymbol(ast.left.type))
            left = resolveSymbol(left, scope, thisObj);
        if(isSymbol(ast.right.type))
            right = resolveSymbol(right, scope, thisObj);
        return `${left} ${ast.operator} ${right}`;
    } else if(ast.type === 'UnaryExpression') {
        let operand = translateCode(ast.argument, scope, indent, thisObj);
        if(isSymbol(ast.argument.type))
            operand = resolveSymbol(operand, scope, thisObj);
        return `${ast.operator}${operand}`;
    } else if(ast.type === 'UpdateExpression') {
        let operand = translateCode(ast.argument, scope, indent, thisObj);
        if(isSymbol(ast.argument.type))
            operand = resolveSymbol(operand, scope, thisObj);
        return `${ast.prefix?ast.operator:''}${operand}${!ast.prefix?ast.operator:''}`;
    } else if(ast.type === 'MemberExpression') {
        // ignore property
        let object = translateCode(ast.object, scope, indent, thisObj);
        let property = translateCode(ast.property, scope, indent, thisObj);
        
        if(ast.computed)
            property = `[${property}]`;
        else
            property = `.${property}`;
            
        return `${ast.object.type==='FunctionExpression'? `(${object})`:object}${property}`;
    } else if(ast.type === 'ThisExpression') {
        return 'this';
    } else if(ast.type === 'Identifier') {
        return ast.name;
    } else if(ast.type === 'Literal') {
        return typeof ast.value === 'string'? `'${ast.value}'`: ast.value;
    }
    return ';';
}


export function generate(classIR, indent, generated) {
    generated = generated? generated: new Set();
    
    indent = indent? indent: 0;
    let src = '', depSrc = '';

    if(generated.has(classIR.objName)) {
        return ['', ''];
    }

    if(classIR instanceof JSClassIR) {
        for(let dep of classIR.getDeps()) {
            let [src_, depSrc_] = generate(dep, indent, generated);
            depSrc += depSrc_;
            depSrc += src_;
        }
        src += `${classIR.class}`;

        generated.add(classIR.objName);
        return [src, depSrc];
    } else if(classIR instanceof ClassIR) {

        let indentStr = ' '.repeat(indent);

        let [src_, depSrc_] = generate(classIR.parent, 0, generated);
        depSrc+=depSrc_;
        depSrc+=src_;


        let propDecl = '';
        let propInit = '', postPropInit = '';
        for(const [pname, pvalue] of Object.entries(classIR.props)) {
            propDecl +=`${' '.repeat(indent+8)}this.addProperty('${pname}');\n`;
            const [propInit_, postPropInit_] = generatePropInit(pname, pvalue, indent+8);
            propInit += propInit_;
            postPropInit += postPropInit_;
        }

        let signalDecl = ''
        for(const [sname, svalue] of Object.entries(classIR.signals)) {
            // Since we allow signal naming to xxxChanged, but property may also add xxxChanged
            // special case: signal positionChanged signal in MouseArea
            if(!(sname.endsWith('Changed') && sname.substr(0, sname.length-7) in classIR.props))
                signalDecl +=`${' '.repeat(indent+8)}this.addSignal('${sname}');\n`;
        }


        let attrInit = '';
        let postAttrInit = '';
        for(const [aname, avalue] of Object.entries(classIR.attributes)) {
            const [attrInit_, postAttrInit_] = generateAttribInit(aname, avalue, indent+8);
            attrInit += attrInit_;
            postAttrInit += postAttrInit_;

        }

        let finalize = '';
        if('onCompleted' in classIR.handlers) {
            finalize = `${' '.repeat(indent+8)}${classIR.objName}.prototype.onCompleted.call(this);\n`;
        }

        let funcsDecl = generateFunctions(classIR.funcs, indent+4, classIR);
        let handlersDecl = generateHandlers(classIR.handlers, indent+4, classIR);
        let handlersConnections = connectHandlers(classIR.handlers, indent+8);
        let [childrenDecl, depSrc__, childrenInit] = generateChildren(classIR.children, indent+8, generated);
        depSrc+=depSrc__;

        src += `
${indentStr}class ${classIR.objName} extends ${classIR.parent.objName} {
${indentStr}    constructor(parent, params) {
${indentStr}        params = params? params: {};
${attrInit}
${indentStr}        super(parent, params);
${propDecl}${signalDecl}${postAttrInit}${postPropInit}${handlersConnections}${propInit}${childrenDecl}${childrenInit}${finalize}
${indentStr}    }
${funcsDecl}${handlersDecl}
${indentStr}}
    
`;


        generated.add(classIR.objName);
        return [src, depSrc];
    }
        
}

function generatePropInit(pname, pvalue, indent) {
    let initVal;
    let postAssign = '';
    switch(pvalue.type) {
        case 'bool':
            initVal = pvalue.value? `${pvalue.value}`: 'false';
            break;
        case 'int':
        case 'real':
            initVal = pvalue.value? `${pvalue.value}`: '0';
            break;
        case 'string':
            initVal = pvalue.value? `'${pvalue.value}'`: `''`;
            break;
        case 'Expression':
            let pdeps = '';
            for(let dep of pvalue.thisDeps) {
                let d = dep.split('.')[0];
                pdeps += `let ${d}=this.${d};\n`;
                postAssign += `${' '.repeat(indent)}chainConnect(this, '${dep}', () => {
${' '.repeat(indent+4)}this._${pname}Dirty = true; this.${pname}Changed.emit(); })\n`;
            }
            initVal = `() => {${pdeps} return ${pvalue.value}};`
            console.log('Warning: Expression binding is not fully support yet')
            break;
        case 'Object':
            break;
    }
    return [`${' '.repeat(indent)}this.${pname} = params && params.${pname}? params.${pname}: ${initVal};\n`, postAssign];
}

function generateAttribInit(aname, avalue, indent) {
    let initVal;
    let postAssign = '';
    switch(avalue.type) {
        case 'Literal':
            initVal = (typeof avalue.value === 'string')?`'${avalue.value}'`: `${avalue.value}`;
            break;
        case 'Expression':
            let adeps = '';
            for(let dep of avalue.thisDeps) {
                let d = dep.split('.')[0];
                adeps += `let ${d}=this.${d};\n`;
                postAssign += `${' '.repeat(indent)}chainConnect(this, '${dep}', () => {
${' '.repeat(indent+4)}this._${aname}Dirty = true; this.${aname}Changed.emit(); })\n`;
            }
            initVal = `() => {${adeps} return ${avalue.value}};`
            console.log('Warning: Expression binding is not fully support yet')
            break;
        case 'Object':
            break;
    }
    return [`${' '.repeat(indent)}params.${aname} = ${initVal};\n`, postAssign];
}

function generateFunctions(funcs, indent, thisObj) {
    let ret = '';
    let indentStr = ' '.repeat(indent);
    for(const [fname, fvalue] of Object.entries(funcs)) {
        let params = fvalue.params.map(x => x.name).join(',')
        
        let code = translateCode(parseFunction(fvalue.src), fvalue.scope, indent, thisObj)

        ret += `${indentStr}${fname}(${params}) {
${code}
${indentStr}}
`;
    }
    return ret;

}

function generateHandlers(handlers, indent, thisObj) {
    let ret = '';
    let indentStr = ' '.repeat(indent);
    for(const [hname, hvalue] of Object.entries(handlers)) {
        let params = hvalue.params.map(x => x.name).join(',')
        let code = translateCode(parseFunction(hvalue.src), hvalue.scope, indent, thisObj)

        ret += `${indentStr}${hname}(${params}) { 
${code}
${indentStr}}
`;
    }
    return ret;

}

function connectHandlers(handlers, indent) {
    let ret = '';
    let indentStr = ' '.repeat(indent);
    
    for(const [hname, hvalue] of Object.entries(handlers)) {
        // Special case
        if(hname === 'onCompleted')
            continue;
        let signame = hname[2].toLowerCase() + hname.slice(3);
        ret += `${indentStr}this.${signame}.connect(this.${hname}.bind(this));\n`;
    }
    return ret;

}

function generateChildren(children, indent, generated) {
    let src = '', depSrc = '', srcInit = '';
    for(let child of children) {
        const [src_, depSrc_] =  generate(child, indent, generated);
        src+=src_;
        depSrc+=depSrc_;
        srcInit += `${' '.repeat(indent)}this.appendChild(new ${child.objName}(this));\n`;
    }
    return [src, depSrc, srcInit];
}