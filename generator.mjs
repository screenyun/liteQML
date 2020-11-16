import * as parser from './parser.mjs';
import * as qmlcore from './qmlcore.mjs';
import {readAllContent, compareMTime, writeFile, getClasses, getMethods, fileExist, simplify_path, dirname} from './utils.mjs';

function warning(msg) {
//    console.log('yoyo')
//    std.err.puts(msg);
}


export function parseFile(filename) {
    let cachedFile = `${filename}.json`;

    let content = readAllContent(`${filename}.json`);
    let ast;
    let fromCache = false;
    if(content && compareMTime(filename, cachedFile)) {
        fromCache = true;
        ast = JSON.parse(content);
    } else {
        content = readAllContent(filename);
        if(content)
            ast = parser.parse(content);
    }
    // cache
    if(ast && !fromCache) {
        writeFile(`${filename}.json`, JSON.stringify(ast));
    }
    return ast;
}

export function parseFunction(code) {
    return parser.parse(code, {startRule:'FunctionBody'});
}

export function parseExpression(code) {
    return parser.parse(code, {startRule:'Expression'});
}

function appendSet(set, list) {
    list.forEach(set.add, set);
}

function analyzeDep(ast, scope) {
    let ret = new Set();
    if(scope == undefined)
        scope = new Set();
    if(Array.isArray(scope)) {
        scope = new Set(scope);
    }
    if(ast.type === 'BlockStatement') {
        let parentScope = new Set(scope);
        ast = ast.body;

        for(let stmt of ast) {
            appendSet(ret, analyzeDep(stmt, parentScope));
        }
    } else if(ast.type === 'IfStatement') {
        appendSet(ret, analyzeDep(ast.test, scope));
        appendSet(ret, analyzeDep(ast.consequent, scope));
        if(ast.alternate)
            appendSet(ret, analyzeDep(ast.alternate, scope));
    } else if(ast.type === 'ExpressionStatement') {
        appendSet(ret, analyzeDep(ast.expression, scope));
    } else if (ast.type === 'BinaryExpression') {
        appendSet(ret, analyzeDep(ast.left, scope));
        appendSet(ret, analyzeDep(ast.right, scope));
    }else if (ast.type === 'CallExpression') {
        appendSet(ret, analyzeDep(ast.callee, scope));
        // parameters
        for(let arg of ast.arguments)
            appendSet(ret, analyzeDep(arg, scope));
    }else if (ast.type === 'AssignmentExpression') {
        //appendSet(ret, analyzeDep(ast.left, scope));
        appendSet(ret, analyzeDep(ast.right, scope));
    } else if (ast.type === 'VariableDeclaration') {
        for(let decl of ast.declarations) {
            appendSet(ret, analyzeDep(decl, scope));
        }
    } else if(ast.type === 'VariableDeclarator') {
        scope.add(ast.id.name);
        if(ast.init)
            appendSet(ret, analyzeDep(ast.init, scope));
    } else if(ast.type === 'MemberExpression') {
        // ignore property
        if(ast.name) {
            let first = ast.name.split('.')[0];
            if(!scope.has(first)) {
                ret.add(first);
            }
        }
    } else if(ast.type === 'Identifier') {
        if(!scope.has(ast.name)) {
            ret.add(ast.name);
        }
    }

    return [...ret];

}

function generateDep(dep, summary) {
    let depCode = '';
    for(let d of dep) {
        if(summary.props.indexOf(d)>=0 || summary.signals.indexOf(d)>=0 || summary.functions.indexOf(d)>=0) {
            depCode += `let ${d}=this.${d};`;
        } else {
            warning(`Warning: referencing ${d} from outer scope may lead to runtime error`);
        }
    }
    return depCode;
}

export class JSClassIR {
    constructor(jsclass) {
        this.class = jsclass;
        this.objName = jsclass.name;
    }

    hasProperty(name) {
        return this.class.summary.props.indexOf(name) != -1;
    }

    hasFunction(name) {
        return this.class.summary.functions.indexOf(name)!=-1;
    }

    hasSignal(name) {
        return this.class.summary.signals.indexOf(name)!=-1;
    }

    has(name) {
        return this.hasFunction(name) || this.hasProperty(name) || this.hasSignal(name);
    }

    getDeps() {
        return this.class.summary.deps?this.class.summary.deps.map((x) => new JSClassIR(x)): [];
    }

    getProperty(name) {
        if(this.hasProperty(name)) {
            return {type: 'var'};
        }
    }

    getSignal(name) {
        // unsupported
        return this.class.summary.signals.indexOf(name)!=-1? {params: []}: undefined;
    }

}

class ImportSolver {
    constructor(scriptPath) {
        this.importPath = [scriptPath];
        this.imported = {};

    }

    addImportPath(path) {
        path = simplify_path(path)
        if(this.importPath.indexOf(path) === -1)
            this.importPath.push(path);
    }

    additionalPath() {
        return this.importPath.slice(1)
    }

    addImport(uri, version, as) {
        let qmldir;
        let path = uri.split('.').join('/');
        let resolvedPath = ''
        for(let p of this.importPath) {
            resolvedPath = p;
            qmldir = readAllContent(`${p}/${path}/qmldir`);
            if(qmldir)
                break;
        }
        if(!qmldir) {
            throw `Module ${uri} is not installed`;
        }

        // parsing
        qmldir = qmldir.split('\n');
        for(let entry of qmldir) {
            entry = entry.trim().split(' ');
            switch(entry[0]) {
                case 'module':
                case 'plugin':
                case 'singleton':
                    break;
                
                default:
                    if(entry.length == 3 && version == entry[1]) {
                        let filePath = simplify_path(`${resolvedPath}/${path}/${entry[2]}`);
                        if(fileExist(filePath)) {
                            let compName = `${as?as+'.':''}${entry[0]}`;
                            if(!(compName in this.imported))
                                this.imported[compName] = `${filePath}`;
                            else
                                throw `Component Name collision! ${uri} ${compName}`;
                        }
                        else
                            throw `Cannot locate ${filePath}`;
                    }

            }

        }

    }

    resolveType(name) {
        if(name in this.imported) {
            return this.imported[name];
        } else if(fileExist(`${this.importPath[0]}/${name}.qml`)) {
            return `${this.importPath[0]}/${name}.qml`;
        } else {
            // console.log(JSON.stringify(this.imported, undefined, 4))
            // throw new Error(`Cannot resolve type ${name}`);
            return undefined;
        }
    }
}

/* Do basic checking and linting */
export class ClassIR {
    constructor(options) {
        this.importSolver = new ImportSolver(options.scriptPath);

        // copy?
        this.consumedType = options.consumedType? options.consumedType: {
            'CoreObject': new JSClassIR(qmlcore.CoreObject)
        };
        this.props = {};
        this.funcs = {};
        this.signals = {};
        this.handlers = {};
        this.attributes = {};
        this.children = [];
        this.parent = null;
        this.filename = '';
        this.silent = options.silent
    }

    addImportPath(path) {
        this.importSolver.addImportPath(path);
    }

    // For test only don't call this function in production
    addImport(path, version, as) {
        this.importSolver.addImport(path, version, as);
    }

    resolveType(name) {
        if(name in this.consumedType) {
            return name;
        } else 
            return this.importSolver.resolveType(name);
    }

    consumeQMLFileAST(ast, objName) {
        // add imports
        for(let imp of ast.imports) {
            this.importSolver.addImport(imp.name, imp.version, imp.as);
        }

        if(ast.objects.length >= 1) {
            let firstObject = ast.objects[0];
            this.ir = this.consumeObjectAST(firstObject, objName);
        }
    }

    consumeObjectAST(ast, objName, scope) {
        scope = scope? scope: new Set();
        this.objName = objName;
        
        if(ast.type) {
            let resolved = this.resolveType(ast.type);
            if(!resolved)
                throw new Error(`Cannot resolve ${ast.type}`);
            if(!(resolved in this.consumedType)) {
                let resolvedDir = dirname(resolved);
                
                let parent = new ClassIR({scriptPath: resolvedDir, consumedType: this.consumedType});
                // copy importPath
                for(let path of this.importSolver.additionalPath())
                    parent.addImportPath(path)
                
                parent.load(resolved);
                this.consumedType[resolved] = parent;
            }
            if(!this.silent)
                console.log(`Processing ${this.filename} for ${objName}`)
            this.parent = this.consumedType[resolved];

            if(ast.functions) {
                this.consumeFunctionsDecl(ast.functions);
            }
            
            if(ast.properties) {
                this.consumePropertiesDecl(ast.properties);
            }

            if(ast.signals) {
                this.consumeSignalsDecl(ast.signals);
            }

            if(ast.attributes) {
                this.consumeAttributesDecl(ast.attributes);
            }

            if(ast.handlers) {
                this.consumeHandlersDecl(ast.handlers);
            }

            if(ast.children) {
                this.consumeChildren(ast.children);
            }

            this.analyzeFunctionDep();
            this.analyzeHandlerDep();
            this.analyzeExpressionDep();

            
        } else
            throw new Error(`Invalid AST (${this.filename})`);
    }

    consumePropertiesDecl(props) {
        for(let p of props) {
            if(!this.has(p.name)) {
                this.props[p.name] = {
                    type: p.propertyType,
                    initType: p.type,
                    value: p.value
                };
                this.signals[`${p.name}Changed`] = {
                    params: []
                }
            } else {
                throw new Error(`Property name '${p.name}' collides with other name (${this.filename})`);
            }
        }
    }

    consumeFunctionsDecl(funcs) {
        for(let f of funcs) {
            // collision for overriding
            this.funcs[f.name] = {
                params: f.params? f.params: [],
                src: f.src,
            }
        }
    }

    consumeSignalsDecl(signals) {
        for(let sig of signals) {
            // collision for overriding
            if(!this.has(sig.name)) {
                this.signals[sig.name] = {
                    params: sig.params? sig.params: []
                }
            } else {
                throw new Error(`Signal name '${sig.name}' collides with other name (${this.filename})`);
            }
        }
    }

    consumeHandlersDecl(handlers) {
        for(let h of handlers) {
            let signame = h.name[2].toLowerCase()+h.name.slice(3);
            let signal = this.getSignal(signame);
            if(signal) {
                this.handlers[h.name] = {
                    src: h.value,
                    connect: signame,
                    params: signal.params
                }
            } else
                throw new Error(`Handler ${h.name} connects to non-existing signal (${this.filename})`);
            
        }
    }

    consumeAttributesDecl(attributes) {
        for(let attr of attributes) {
            let prop = this.parent.getProperty(attr.name);
            if(prop) {
                if(attr.name in this.attributes)
                    throw new Error(`Re-assign to attribute ${attr.name} (${this.filename})`);
                this.attributes[attr.name] = {ptype: prop.type, type: attr.type, value: attr.value};
                
            } else
                throw new Error(`Property ${attr.name} does not exist in base class (${this.filename})`);
        }

    }

    consumeChildren(children) {
        for(let child of children) {

            // create a sandbox for children
            let childIR = new ClassIR({scriptPath: '', consumedType: this.consumedType, silent: true})
            // share import solver
            childIR.importSolver = this.importSolver;
            childIR.filename = this.filename;
            childIR.consumeObjectAST(child, `${this.objName}_${child.type.split('.').join('_')}_${this.children.length}`);
            this.children.push(childIR);
        }
    }

    analyzeFunctionDep() {
        for(let [fname, fvalue] of Object.entries(this.funcs)) {
            let ast = parseFunction(fvalue.src);
            let scope = ['undefined', 'NaN', 'console', 'this', 'globalThis', ...fvalue.params.map(x => x.name)];
            let deps = analyzeDep(ast, scope);

            let thisDeps = [];
            for(let dep of deps) {
                if(this.has(dep)) {
                    thisDeps.push(dep);
                } else {
                    console.log(`Warning: Referencing ${dep} that is not in the same file. (${fname}:${this.filename})`);
                }
            }
            fvalue.thisDeps = thisDeps;
        }

    }

    analyzeHandlerDep() {
        for(let [fname, fvalue] of Object.entries(this.handlers)) {
            let ast = parseFunction(fvalue.src);
            let scope = ['undefined', 'NaN', 'console', 'this', 'globalThis', ...fvalue.params.map(x => x.name)];
            let deps = analyzeDep(ast, scope);

            let thisDeps = [];
            for(let dep of deps) {
                if(this.has(dep)) {
                    thisDeps.push(dep);
                } else {
                    console.log(`Warning: Referencing ${dep} that is not in the same file. (${fname}:${this.filename})`);
                }
            }
            fvalue.thisDeps = thisDeps;
        }

    }


    analyzeExpressionDep() {
        let scope = ['undefined', 'NaN', 'console', 'this', 'globalThis'];
        for(let [pname, pvalue] of Object.entries(this.props)) {
            if(pvalue.type === 'Expression') {
                let expr = pvalue.value.trim();
                let ast = parseExpression(expr);
                
                let deps = analyzeDep(ast, scope);
                let thisDeps = [];
                for(let dep of deps) {
                    if(this.has(dep)) {
                        thisDeps.push(dep);
                    } else {
                        console.log(`Warning: Referencing ${dep} (property ${pname}: ${expr}) that is not in the same file. (${this.filename})`);
                    }
                }
                pvalue.thisDeps = thisDeps;
            
            }
        }

        for(let [aname, avalue] of Object.entries(this.attributes)) {
            
            if(avalue.type === 'Expression') {
                let expr = avalue.value.trim();
                let ast = parseExpression(expr);
                
                let deps = analyzeDep(ast, scope);
                let thisDeps = [];
                for(let dep of deps) {
                    if(this.has(dep)) {
                        thisDeps.push(dep);
                    } else {
                        console.log(`Warning: Referencing ${dep} (${aname}: ${expr}) that is not in the same file. (${this.filename})`);
                    }
                }
                avalue.thisDeps = thisDeps;
            }
        }
    }

    hasProperty(name) {
        return name in this.props || this.parent.hasProperty(name);
    }

    getProperty(name) {
        return name in this.props? this.props[name]:this.parent.getProperty(name);
    }

    hasSignal(name) {
        return name in this.signals || this.parent.hasSignal(name);
    }
    
    getSignal(name) {
        return name in this.signals ? this.signals[name]:this.parent.getSignal(name);
    }

    has(name) {
        return name in this.props || name in this.signals || name in this.funcs || this.parent.has(name)
    }

    load(filename) {
        if(fileExist(filename)) {
            this.filename = filename;
            let content = readAllContent(filename);

            let ast = parser.parse(content);

            filename = filename.substring(filename.lastIndexOf('/')+1, filename.lastIndexOf('.qml'));

            this.consumeQMLFileAST(ast, filename);
        } else
            throw new Error(`File ${filename} not found`);
    }
}

