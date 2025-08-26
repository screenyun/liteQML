import { JSClassIR, ClassIR } from './ir.mjs';
import { parse } from './parser.mjs';

function parseFunction(code) {
  return parse(code, {startRule:'FunctionBody'});
}

function parseExpression(code) {
  return parse(code, {startRule:'Expression'});
}


function isSymbol(type) {
    return type === 'Identifier' || type === 'MemberExpression';
}

export class Translator {
    constructor(scope, thisObj, indent) {
        this.thisObj = thisObj;
        this.indent = indent;
        this.scope = scope;
    }

    resolveSymbol(symbol, scope) {
        let head = symbol.split(/[\.\[]/)[0];
        if (head != 'this') {
            if (!scope.has(head)) {
                if (this.thisObj.has(head)) {
                    this.usedThis.add(symbol);
                    symbol = `this.${symbol}`;
                } else {
                    if (head.match(/^[a-z]/)) {
                        // TODO Generate pre-resolved reference at compile time
                        if (this.thisObj.resolve(head)) {
                            this.usedIDs.push({ object: head, prop: symbol.slice(head.length + 1) });
                            symbol = `this.resolve('${head}')` + (symbol == head ? '' : '.') + `${symbol.slice(head.length + 1)}`;
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
        indent = indent ? indent : this.indent;
        if (scope == undefined)
            scope = new Set(this.scope);
        if (Array.isArray(scope)) {
            scope = new Set(scope);
        }
        this.usedIDs = [];
        this.usedThis = new Set();
        let ret = this._translateCode(ast, scope, indent);
        if (isSymbol(ast.type)) {
            ret = this.resolveSymbol(ret, scope);
        }
        this.usedThis = [...this.usedThis];
        return ret;
    }

    _translateCode(ast, scope, indent) {
        let src = '';
        let indentStr = ' '.repeat(indent);
        if (ast.type == 'BlockStatement') {
            let parentScope = new Set(scope);
            ast = ast.body;
            let advIndent = 4;

            if (ast.length <= 1)
                advIndent = 0;
            for (let stmt of ast) {
                src += this._translateCode(stmt, parentScope, indent + advIndent) + '\n';
            }
            return (advIndent ? `${indentStr}{\n` : '') + `${src}\n` + (advIndent ? `${indentStr}}` : '');
        } else if (ast.type === 'IfStatement') {
            let test = this._translateCode(ast.test, scope, indent);
            if (isSymbol(ast.test.type))
                test = this.resolveSymbol(test, scope);
            let consequent = this._translateCode(ast.consequent, scope, indent);
            if (isSymbol(ast.consequent.type))
                consequent = this.resolveSymbol(consequent, scope);
            let alternate = '';
            if (ast.alternate) {
                let ret = this._translateCode(ast.alternate, scope, indent).trim();
                if (isSymbol(ast.alternate.type))
                    ret = this.resolveSymbol(ret, scope);
                alternate = 'else ' + ret;
            }
            return `${indentStr}if (${test}) ${consequent.trim()} ${alternate}`
        } else if (ast.type === 'ExpressionStatement') {
            let expr = this._translateCode(ast.expression, scope, indent);
            if (isSymbol(ast.expression.type))
                expr = this.resolveSymbol(expr, scope);
            return `${indentStr}${expr};`;
        } else if (ast.type === 'ReturnStatement') {
            if (ast.argument) {
                let expr = this._translateCode(ast.argument, scope, indent);
                if (isSymbol(ast.argument.type))
                    expr = this.resolveSymbol(expr, scope);
                return `${indentStr}return ${expr};\n`;
            } else
                return `${indentStr}return;\n`;

        } else if (ast.type === 'VariableDeclaration') {

            let lst = []
            for (let decl of ast.declarations) {
                lst.push(this._translateCode(decl, scope, indent));
            }
            return `${indentStr}let ${lst.join(', ')}`;

        } else if (ast.type === 'VariableDeclarator') {
            let init = '';
            scope.add(ast.id.name);
            if (ast.init) {
                let rhs = this._translateCode(ast.init, scope, indent);
                if (isSymbol(ast.init.type))
                    rhs = this.resolveSymbol(rhs, scope);
                init = '=' + rhs;
            }
            return `${ast.id.name}${init}`;

        } else if (ast.type === 'ObjectExpression') {
            // TODO Finish this
            console.log('JSON is not fully supported yet');
            return '{}';
        } else if (ast.type === 'LogicalExpression') {
            let left = this._translateCode(ast.left, scope, indent);
            let right = this._translateCode(ast.right, scope, indent);
            if (isSymbol(ast.left.type))
                left = this.resolveSymbol(left, scope);
            if (isSymbol(ast.right.type))
                right = this.resolveSymbol(right, scope);

            return `${left} ${ast.operator} ${right}`;
        } else if (ast.type === 'ArrayExpression') {
            let elements = ast.elements.map(x => {
                // Indent??
                let element = this._translateCode(x, scope, indent + 4);
                if (isSymbol(x.type))
                    element = this.resolveSymbol(element, scope);
                return element;
            });
            return `[${elements.join(', ')}]`;
        } else if (ast.type === 'FunctionExpression') {
            let body = this._translateCode(ast.body, scope, indent);
            return `function () {${body.trim()}}`;
        } else if (ast.type === 'ForStatement') {
            let childScope = new Set(scope);
            let init = ast.init ? this._translateCode(ast.init, childScope, 0) : '';
            let update = ast.update ? this._translateCode(ast.update, childScope, 0) : '';
            let test = ast.test ? this._translateCode(ast.test, childScope, 0) : '';

            let body = ast.body ? this._translateCode(ast.body, childScope, indent + 4) : '';

            return `${indentStr}for(${init}; ${test}; ${update})\n${body}`;
        } else if (ast.type === 'ConditionalExpression') {
            let test = this._translateCode(ast.test, scope, indent);
            if (isSymbol(ast.test.type))
                test = this.resolveSymbol(test, scope);
            let consequent = this._translateCode(ast.consequent, scope, indent);
            if (isSymbol(ast.consequent.type))
                consequent = this.resolveSymbol(consequent, scope);
            let alternate = '';
            if (ast.alternate) {
                let ret = this._translateCode(ast.alternate, scope, indent).trim();
                if (isSymbol(ast.alternate.type))
                    ret = this.resolveSymbol(ret, scope);
                alternate = ret;
            }
            return `${test}?${consequent.trim()}:${alternate}`
        } else if (ast.type === 'CallExpression') {
            let callee = this._translateCode(ast.callee, scope, indent);
            if (isSymbol(ast.callee.type))
                callee = this.resolveSymbol(callee, scope);
            // parameters
            let args = ast.arguments.map(x => {
                let ret = this._translateCode(x, scope, indent);
                if (isSymbol(x.type))
                    ret = this.resolveSymbol(ret, scope);
                return ret;
            }).join(', ');
            return `${callee}(${args})`;
        } else if (ast.type === 'BinaryExpression') {
            let left = this._translateCode(ast.left, scope, indent);
            let right = this._translateCode(ast.right, scope, indent);
            if (isSymbol(ast.left.type))
                left = this.resolveSymbol(left, scope);
            if (isSymbol(ast.right.type))
                right = this.resolveSymbol(right, scope);

            return `(${left} ${ast.operator} ${right})`;
        } else if (ast.type === 'AssignmentExpression') {
            let left = this._translateCode(ast.left, scope, indent);
            let right = this._translateCode(ast.right, scope, indent);
            if (isSymbol(ast.left.type))
                left = this.resolveSymbol(left, scope);
            if (isSymbol(ast.right.type))
                right = this.resolveSymbol(right, scope);
            return `${left} ${ast.operator} ${right}`;
        } else if (ast.type === 'UnaryExpression') {
            let operand = this._translateCode(ast.argument, scope, indent);
            if (isSymbol(ast.argument.type))
                operand = this.resolveSymbol(operand, scope);
            return `${ast.operator}${operand}`;
        } else if (ast.type === 'UpdateExpression') {
            let operand = this._translateCode(ast.argument, scope, indent);
            if (isSymbol(ast.argument.type))
                operand = this.resolveSymbol(operand, scope);
            return `${ast.prefix ? ast.operator : ''}${operand}${!ast.prefix ? ast.operator : ''}`;
        } else if (ast.type === 'MemberExpression') {
            // ignore property
            let object = this._translateCode(ast.object, scope, indent);
            let property = this._translateCode(ast.property, scope, indent);

            if (ast.computed)
                property = `[${property}]`;
            else
                property = `.${property}`;

            return `${ast.object.type === 'FunctionExpression' ? `(${object})` : object}${property}`;
        } else if (ast.type === 'ThisExpression') {
            return 'this';
        } else if (ast.type === 'Identifier') {
            return ast.name;
        } else if (ast.type === 'Literal') {
            return typeof ast.value === 'string' ? `'${ast.value}'` : `${ast.value}`;
        }
        return ';';
    }


}

export class Generator {
    constructor(classIR, generated) {
        this.generated = generated ? generated : new Set();
        this.classIR = classIR;
        this.src = '';
        this.depSrc = '';

        this.idInit = '';
        this.attrInit = '';
        this.attrPostInit = '';
        this.propDecl = '';
        this.propInit = '';
        this.postPropInit = '';
        this.signalDecl = '';
        this.funcsDecl = '';
        this.handlersDecl = '';
        this.handlersConnections = '';
        this.finalize = '';

        this.childSrc = '';
        this.childDep = '';
    }

    generate(indent) {
        indent = indent ? indent : 0;
        this._generate(indent);
        return `${this.depSrc}${this.src}`;
    }

    _generate(indent) {
        
        if (this.generated.has(this.classIR)) {
            return;
        }
        // If classIR is a instance of javascript class
        if (this.classIR instanceof JSClassIR) {
            for (let dep of this.classIR.getDeps()) {
                let gen = new Generator(dep, this.generated);
                gen._generate(indent);
                this.depSrc += gen.depSrc;
                this.depSrc += gen.src;
            }
            // Attach source code of the class by casting it to string
            
            this.src += `${this.classIR.class}\n`;
            this.generated.add(this.classIR);
            
            return;
        }

        let indentStr = ' '.repeat(indent);

        
        {
            // generate parent and its deps as deps of this class
            let parent = new Generator(this.classIR.parent, this.generated);
            parent._generate(0);
            this.depSrc += parent.depSrc;
            this.depSrc += parent.src;
        }

        // Declare id for dynamic resolving
        if (this.classIR.id)
            this.idInit = `${' '.repeat(indent + 8)}this._id['${this.classIR.id}']=this;\n`;

        for (const [aname, avalue] of Object.entries(this.classIR.attributes)) {
            this.generateAttribInit(aname, avalue, indent + 8);
        }

        for (const [pname, pvalue] of Object.entries(this.classIR.props)) {
            this.generatePropInit(pname, pvalue, indent + 8);
        }

        for (const [sname, svalue] of Object.entries(this.classIR.signals)) {
            // Since we allow signal naming to xxxChanged, but property may also add xxxChanged
            // special case: signal positionChanged signal in MouseArea
            this.generateSignal(sname, indent+8);
        }


        for(let child of this.classIR.children) {
            this.generateChild(child, indent+8);
        }

        for(const [fname, fvalue] of Object.entries(this.classIR.funcs)) {
            this.generateFunction(fname, fvalue, indent+4);
        }

        for(const [hname, hvalue] of Object.entries(this.classIR.handlers)) {
            this.generateHandler(hname, hvalue, indent+4);
            this.generateHandlerConnection(hname, indent+8);
        }


        this.depSrc += this.childDep;

        this.src = `
${indentStr}class ${this.classIR.objName} extends ${this.classIR.parent.objName} {
${indentStr}    constructor(parent, params) {
${indentStr}        super(parent, params);
${this.idInit}${this.propDecl}${this.signalDecl}${this.handlersConnections}${this.propInit}${this.attrInit}${this.childSrc}${this.postPropInit}${this.attrPostInit}
${indentStr}        this.registerAll();
${this.finalize}
${indentStr}    }
${this.funcsDecl}
${this.handlersDecl}
${indentStr}}
`;

        this.generated.add(this.classIR);

    }

    generateAttribInit(aname, avalue, indent) {
        let initVal;
        let postAssign = '';
        switch (avalue.type) {
            case 'Literal':
                initVal = (typeof avalue.value === 'string') ? `'${avalue.value}'` : `${avalue.value}`;
                break;
            case 'Expression':
                let ast = parseExpression(avalue.value.trim());
                let trans = new Translator([], this.classIR, 0);
                let code = trans.translateCode(ast);
                initVal = `Binding(() => { return ${code}; }, this, ${JSON.stringify(trans.usedThis)}, ${JSON.stringify(trans.usedIDs)})`;
                console.log('Warning: Expression binding is not fully support yet');
                break;
            case 'QObject':
                let generator = new Generator(avalue.value, this.generated);
                generator.generate(indent);
                this.depSrc += generator.depSrc;            
                this.attrInit += generator.src;
                // Currently we implement this as attrib's parent
                initVal = `${generator.classIR.objName}`;
                break;
        }
        this.attrInit += `${' '.repeat(indent)}this.${aname} = ${initVal};\n`;
        this.attrPostInit += postAssign;
    }

    generatePropInit(pname, pvalue, indent) {
        let initVal;
        let postAssign = '';
        
        let isObject = false;
        switch (pvalue.type) {
            case 'bool':
                initVal = pvalue.value ? `${pvalue.value}` : 'false';
                break;
            case 'int':
            case 'real':
                initVal = pvalue.value ? `${pvalue.value}` : '0';
                break;
            case 'string':
                initVal = pvalue.value ? `'${pvalue.value}'` : `''`;
                break;
            case 'color':
                initVal = pvalue.value ? `'${pvalue.value}'` : `"white"`;
                break;
            case 'var':
                throw new Error('Cannot use variant type currently');
            default:
                if(pvalue.type.match(/^[A-Z]/)) {
                    isObject = true;
                }
                initVal = "null";
                break;
        }
        if (pvalue.initType === 'Expression') {
            
            let ast = parseExpression(pvalue.value.trim());
            let trans = new Translator([], this.classIR, 0);
            let code = trans.translateCode(ast);
            initVal = `Binding(() => { return ${code}; }, this, ${JSON.stringify(trans.usedThis)}, ${JSON.stringify(trans.usedIDs)})`;
            console.log('Warning: Expression binding is not fully support yet');
        }

        if (pvalue.initType === 'QObject') {
            let generator = new Generator(pvalue.value, this.generated);
            generator.generate(indent);
            this.depSrc += generator.depSrc;
            this.propInit += generator.src;
            initVal = `new ${generator.classIR.objName}(this)`;
        }
        this.propDecl += `${' '.repeat(indent)}this.addProperty('${pname}');\n`;
        this.propInit += `${' '.repeat(indent)}this.${pname} = params && params.${pname}? params.${pname}: ${initVal};\n`;
        this.postPropInit += postAssign;
    }

    generateSignal(sname, indent) {
        if (!(sname.endsWith('Changed') && sname.substr(0, sname.length - 7) in this.classIR.props))
            this.signalDecl += `${' '.repeat(indent)}this.addSignal('${sname}');\n`;
    }

    generateChild(child, indent) {
        
        let generator = new Generator(child, this.generated);
        generator.generate(indent);
        this.childSrc += generator.src;
        this.childDep += generator.depSrc;
        this.childSrc += `${' '.repeat(indent)}this.appendChild(new ${child.objName}(this));\n`;
    
    }


    generateFunction(fname, fvalue, indent) {
        let indentStr = ' '.repeat(indent);
        let params = fvalue.params.map(x => x.name).join(',')
        let trans = new Translator(fvalue.scope, this.classIR, indent);

        let code = trans.translateCode(parseFunction(fvalue.src))
        this.funcsDecl += `${indentStr}${fname}(${params}) {
${code}
${indentStr}}
`;
 
    
    }
    
    generateHandler(hname, hvalue, indent) {
        let indentStr = ' '.repeat(indent);

        let params = hvalue.params.map(x => x.name).join(',')
        let trans = new Translator(hvalue.scope, this.classIR, indent);
        let code = trans.translateCode(parseFunction(hvalue.src))

        this.handlersDecl += `${indentStr}${hname}(${params}) { 
${code}
${indentStr}}
`;
    
    }
    
    generateHandlerConnection(hname, indent) {
        let indentStr = ' '.repeat(indent);
        if(hname != 'onCompleted') {
            let signame = hname[2].toLowerCase() + hname.slice(3);
            this.handlersConnections += `${indentStr}this.${signame}.connect(this.${hname}.bind(this));\n`;;
        } else {
            this.finalize = `${indentStr}${this.classIR.objName}.prototype.onCompleted.call(this);\n`;
        }
    }
}
