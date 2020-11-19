import {JSClassIR, ClassIR} from './ir.mjs'
import {parseFunction, parseExpression} from './parser.mjs'


export class Translator {
    constructor(scope, thisObj, indent) {
        this.thisObj = thisObj;
        this.indent = indent;
        this.scope = scope;

        this.usedIDs = [];
        this.usedThis = {};
    }

    resolveSymbol(symbol, scope) {
        let head = symbol.split(/[\.\[]/)[0];
        if(head != 'this') {
            if(!scope.has(head)) {
                if(this.thisObj.has(head)) {
                    this.usedThis[head] = symbol;
                    symbol = `this.${symbol}`;
                } else {
                    if(head.match(/^[a-z]/)) {
                        // TODO Generate pre-resolved reference at compile time
                        if(this.thisObj.resolve(head)) {
                            this.usedIDs.push({object: head, prop: symbol.slice(head.length+1)});
                            symbol = `this.resolve('${head}')`+(symbol==head?'':'.')+`${symbol.slice(head.length+1)}`;
                        } else {
                            //console.log();
                            throw new Error(`Referencing symbol ${head}(${symbol}) defined outside scope`);
                        }
                    }
                }
            }
        }
        return symbol;
    }
    
    translateCode(ast, scope, indent) {
        indent = indent? indent: this.indent;
        if(scope == undefined)
            scope = new Set(this.scope);
        if(Array.isArray(scope)) {
            scope = new Set(scope);
        }
        let ret = this._translateCode(ast, scope, indent);
        if(isSymbol(ast.type)) {
            ret = this.resolveSymbol(ret, scope);
        }
        return ret;
    }

    _translateCode(ast, scope, indent) {
        let src = '';
        let indentStr = ' '.repeat(indent);
        if(ast.type == 'BlockStatement') {
            let parentScope = new Set(scope);
            ast = ast.body;
            let advIndent = 4;
    
            if(ast.length <= 1)
                advIndent = 0;
            for(let stmt of ast) {
                src += this._translateCode(stmt, parentScope, indent+advIndent)+'\n';
            }
            return (advIndent?`${indentStr}{\n`: '')+`${src}\n`+(advIndent?`${indentStr}}`:'');
        } else if(ast.type === 'IfStatement') {
            let test = this._translateCode(ast.test, scope, indent);
            if(isSymbol(ast.test.type))
                test = this.resolveSymbol(test, scope);
            let consequent = this._translateCode(ast.consequent, scope, indent);
            if(isSymbol(ast.consequent.type))
                consequent = this.resolveSymbol(consequent, scope);
            let alternate = '';
            if(ast.alternate) {
                let ret = this._translateCode(ast.alternate, scope, indent).trim();
                if(isSymbol(ast.alternate.type))
                    ret = this.resolveSymbol(ret, scope);
                alternate = 'else '+ ret;
            }
            return `${indentStr}if (${test}) ${consequent.trim()} ${alternate}`
        } else if(ast.type === 'ExpressionStatement') {
            let expr = this._translateCode(ast.expression, scope, indent);
            if(isSymbol(ast.expression.type))
                expr = this.resolveSymbol(expr, scope);
            return `${indentStr}${expr};`;
        } else if(ast.type === 'ReturnStatement') {
            if(ast.argument) {
                let expr = this._translateCode(ast.argument, scope, indent);
                if(isSymbol(ast.argument.type))
                    expr = this.resolveSymbol(expr, scope);
                return `${indentStr}return ${expr};\n`;
            } else
                return `${indentStr}return;\n`;
            
        } else if (ast.type === 'VariableDeclaration') {
            
            let lst = []
            for(let decl of ast.declarations) {
                lst.push(this._translateCode(decl, scope, indent));
            }
            return `${indentStr}let ${lst.join(', ')}`;
            
        } else if(ast.type === 'VariableDeclarator') {
            let init='';
            scope.add(ast.id.name);
            if(ast.init) {
                let rhs = this._translateCode(ast.init, scope, indent);
                if(isSymbol(ast.init.type))
                    rhs = this.resolveSymbol(rhs, scope);
                init = '='+rhs;
            }
            return `${ast.id.name}${init}`;
        
        } else if(ast.type === 'ObjectExpression') {
            // TODO Finish this
            console.log('JSON is not fully supported yet');
            return '{}';
        } else if(ast.type === 'LogicalExpression') {
            let left = this._translateCode(ast.left, scope, indent);
            let right = this._translateCode(ast.right, scope, indent);
            if(isSymbol(ast.left.type))
                left = this.resolveSymbol(left, scope);
            if(isSymbol(ast.right.type))
                right = this.resolveSymbol(right, scope);
    
            return `${left} ${ast.operator} ${right}`;
        } else if(ast.type === 'ArrayExpression') {
            let elements = ast.elements.map(x => {
                // Indent??
                let element = this._translateCode(x, scope, indent+4);
                if(isSymbol(x.type))
                    element = this.resolveSymbol(element, scope);
                return element;
            });
            return `[${elements.join(', ')}]`;
        } else if(ast.type === 'FunctionExpression') {
            let body = this._translateCode(ast.body, scope, indent);
            return `function () {${body.trim()}}`;
        } else if(ast.type === 'ForStatement') {
            let childScope = new Set(scope);
            let init = ast.init? this._translateCode(ast.init, childScope, 0): '';
            let update = ast.update? this._translateCode(ast.update, childScope, 0): '';
            let test = ast.test? this._translateCode(ast.test, childScope, 0): '';
            
            let body = ast.body? this._translateCode(ast.body, childScope, indent+4): '';
    
            return `${indentStr}for(${init}; ${test}; ${update})\n${body}`;
        } else if(ast.type === 'ConditionalExpression') {
            let test = this._translateCode(ast.test, scope, indent);
            if(isSymbol(ast.test.type))
                test = this.resolveSymbol(test, scope);
            let consequent = this._translateCode(ast.consequent, scope, indent);
            if(isSymbol(ast.consequent.type))
                consequent = this.resolveSymbol(consequent, scope);
            let alternate = '';
            if(ast.alternate) {
                let ret = this._translateCode(ast.alternate, scope, indent).trim();
                if(isSymbol(ast.alternate.type))
                    ret = this.resolveSymbol(ret, scope);
                alternate = ret;
            }
            return `${test}?${consequent.trim()}:${alternate}`
        } else if(ast.type === 'CallExpression') {
            let callee = this._translateCode(ast.callee, scope, indent);
            if(isSymbol(ast.callee.type))
                callee = this.resolveSymbol(callee, scope);
            // parameters
            let args = ast.arguments.map(x => {
                let ret = this._translateCode(x, scope, indent);
                if(isSymbol(x.type))
                    ret = this.resolveSymbol(ret, scope);
                return ret;
            }).join(', ');
            return `${callee}(${args})`;
        } else if(ast.type === 'BinaryExpression') {
            let left = this._translateCode(ast.left, scope, indent);
            let right = this._translateCode(ast.right, scope, indent);
            if(isSymbol(ast.left.type))
                left = this.resolveSymbol(left, scope);
            if(isSymbol(ast.right.type))
                right = this.resolveSymbol(right, scope);
    
            return `(${left} ${ast.operator} ${right})`;
        } else if (ast.type === 'AssignmentExpression') {
            let left = this._translateCode(ast.left, scope, indent);
            let right = this._translateCode(ast.right, scope, indent);
            if(isSymbol(ast.left.type))
                left = this.resolveSymbol(left, scope);
            if(isSymbol(ast.right.type))
                right = this.resolveSymbol(right, scope);
            return `${left} ${ast.operator} ${right}`;
        } else if(ast.type === 'UnaryExpression') {
            let operand = this._translateCode(ast.argument, scope, indent);
            if(isSymbol(ast.argument.type))
                operand = this.resolveSymbol(operand, scope);
            return `${ast.operator}${operand}`;
        } else if(ast.type === 'UpdateExpression') {
            let operand = this._translateCode(ast.argument, scope, indent);
            if(isSymbol(ast.argument.type))
                operand = this.resolveSymbol(operand, scope);
            return `${ast.prefix?ast.operator:''}${operand}${!ast.prefix?ast.operator:''}`;
        } else if(ast.type === 'MemberExpression') {
            // ignore property
            let object = this._translateCode(ast.object, scope, indent);
            let property = this._translateCode(ast.property, scope, indent);
            
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
            return typeof ast.value === 'string'? `'${ast.value}'`: `${ast.value}`;
        }
        return ';';
    }
    
    
}

function isSymbol(type) {
    return type === 'Identifier' || type === 'MemberExpression';
}

function resolveSymbol(symbol, scope, thisObj) {
    let head = symbol.split(/[\.\[]/)[0];
    if(head != 'this') {
        if(!scope.has(head)) {
            if(thisObj.has(head))
                symbol = `this.${symbol}`;
            else {
                if(head.match(/^[a-z]/))
                    symbol = `this.resolve('${head}')${symbol.slice(head.length)}`;
                // TODO This warning should be corrected
                // console.log(`Referencing symbol ${head} defined outside scope`);
            }
        }
    }
    return symbol;
}
/*
export function translateCode(ast, scope, indent, thisObj, summary) {
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
            if(isSymbol(ast.alternate.type))
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
        console.log('JSON is not fully supported yet');
        return '{}';
    } else if(ast.type === 'ArrayExpression') {
        let elements = ast.elements.map(x => {
            // Indent??
            let element = translateCode(x, scope, indent+4, thisObj);
            if(isSymbol(x.type))
                element = resolveSymbol(element, scope, thisObj);
            return element;
        });
        return `[${elements.join(', ')}]`;
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
    } else if(ast.type === 'ConditionalExpression') {
        let test = translateCode(ast.test, scope, indent, thisObj);
        if(isSymbol(ast.test.type))
            test = resolveSymbol(test, scope, thisObj);
        let consequent = translateCode(ast.consequent, scope, indent, thisObj);
        if(isSymbol(ast.consequent.type))
            consequent = resolveSymbol(consequent, scope, thisObj);
        let alternate = '';
        if(ast.alternate) {
            let ret = translateCode(ast.alternate, scope, indent, thisObj).trim();
            if(isSymbol(ast.alternate.type))
                ret = resolveSymbol(ret, scope, thisObj);
            alternate = ret;
        }
        return `${test}?${consequent.trim()}:${alternate}`
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
        return typeof ast.value === 'string'? `'${ast.value}'`: `${ast.value}`;
    }
    return ';';
}
*/

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

        let idInit = ''
        if(classIR.id) 
            idInit = `${' '.repeat(indent+8)}this._id['${classIR.id}']=this;\n`;


        let propDecl = '';
        let propInit = '', postPropInit = '';
        for(const [pname, pvalue] of Object.entries(classIR.props)) {
            propDecl +=`${' '.repeat(indent+8)}this.addProperty('${pname}');\n`;
            const [propInit_, postPropInit_] = generatePropInit(pname, pvalue, indent+8, classIR);
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
            const [attrInit_, postAttrInit_] = generateAttribInit(aname, avalue, indent+8, classIR);
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
${idInit}${propDecl}${signalDecl}${handlersConnections}${propInit}${childrenDecl}${childrenInit}${postAttrInit}${postPropInit}${finalize}
${indentStr}    }
${funcsDecl}${handlersDecl}
${indentStr}}
    
`;


        generated.add(classIR.objName);
        return [src, depSrc];
    }
        
}

function generatePropInit(pname, pvalue, indent, thisObj) {
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
        case 'Object':
            break;
    }
    if(pvalue.initType === 'Expression') {
        let ast = parseExpression(pvalue.value.trim());
        let trans = new Translator([], thisObj, 0);
        let code = trans.translateCode(ast);
        for(const [a, chain] of Object.entries(trans.usedThis)) {
            postAssign += `${' '.repeat(indent)}chainConnect(this, '${chain}', () => {
${' '.repeat(indent+4)}this._${pname}Dirty = true; this.${pname}Changed.emit(); })\n`;
        }
        for(let dep of trans.usedIDs) {
            postAssign += `${' '.repeat(indent)}chainConnect(this.resolve('${dep.object}'), '${dep.prop}', () => {
                ${' '.repeat(indent+4)}this._${pname}Dirty = true; this.${pname}Changed.emit(); })\n`;
        }
        
        initVal = `() => { return ${code}; }`
        console.log('Warning: Expression binding is not fully support yet')
    }
    return [`${' '.repeat(indent)}this.${pname} = params && params.${pname}? params.${pname}: ${initVal};\n`, postAssign];
}

function generateAttribInit(aname, avalue, indent, thisObj) {
    let initVal;
    let postAssign = '';
    switch(avalue.type) {
        case 'Literal':
            initVal = (typeof avalue.value === 'string')?`'${avalue.value}'`: `${avalue.value}`;
            break;
        case 'Expression':
            let ast = parseExpression(avalue.value.trim());
            let trans = new Translator([], thisObj, 0);
            let code = trans.translateCode(ast);
            for(const [a, chain] of Object.entries(trans.usedThis)) {
                postAssign += `${' '.repeat(indent)}chainConnect(this, '${chain}', () => {
${' '.repeat(indent+4)}this._${aname}Dirty = true; this.${aname}Changed.emit(); })\n`;
            }
            for(let dep of trans.usedIDs) {
                postAssign += `${' '.repeat(indent)}chainConnect(this.resolve('${dep.object}'), '${dep.prop}', () => {
                    ${' '.repeat(indent+4)}this._${aname}Dirty = true; this.${aname}Changed.emit(); })\n`;
            }
            initVal = `() => { return ${code} };`
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
        let trans = new Translator(fvalue.scope, thisObj, indent);
        
        let code = trans.translateCode(parseFunction(fvalue.src))
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
        let trans = new Translator(hvalue.scope, thisObj, indent);
        let code = trans.translateCode(parseFunction(hvalue.src))

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