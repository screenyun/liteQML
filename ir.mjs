import {parse, parseFunction, parseExpression} from './parser.mjs';
import * as qmlcore from './qmlcore.mjs';
import {readAllContent, fileExist, compareMTime, simplify_path, dirname, writeFile} from './utils.mjs';

export function parseFile(filename, noCache) {
    let cachedFilename = `${filename}.json`;

    if(!fileExist(filename))
        throw new Error(`${filename} does not exist`);

    let ast;
    let fromCache = false;
    if(!noCache && fileExist(cachedFilename) && compareMTime(filename, cachedFilename)) {
        let content = readAllContent(cachedFilename);
        fromCache = true;
        ast = JSON.parse(content);
    } else {
        let content = readAllContent(filename);
        if(content)
            ast = parse(content);
    }
    // cache
    if(ast && !fromCache) {
        writeFile(`${filename}.json`, JSON.stringify(ast));
    }
    return ast;
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

    resolve() {
        return undefined;
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
    constructor(options, parentNode) {
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
        this.parentNode = parentNode? parentNode: null;
        this.filename = '';
        this.silent = options.silent
        
        this.noCache = options.noCache;
        // for static id resolve
        this._id = {};

        options.env = options.env? options.env: [];
        this.env = [...new Set(['undefined', 'NaN', 'console', 'this', 'globalThis', ...options.env])];
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
            this.consumeObjectAST(firstObject, objName);
        }
    }

    consumeObjectAST(ast, objName, scope) {
        scope = scope? scope: new Set();
        this.objName = objName;

        if(!this.silent)
            console.log(`Processing ${this.filename} for ${objName}`)
        
        if(ast.type) {
            let resolved = this.resolveType(ast.type);
            if(!resolved)
                throw new Error(`Cannot resolve ${ast.type}`);
            if(!(resolved in this.consumedType)) {
                let resolvedDir = dirname(resolved);
                
                let parent = new ClassIR({
                    scriptPath: resolvedDir,
                    consumedType: this.consumedType,
                    noCache: this.noCache,
                    env: this.env
                });
                // copy importPath
                for(let path of this.importSolver.additionalPath())
                    parent.addImportPath(path)
                
                parent.load(resolved);
                this.consumedType[resolved] = parent;
            }
            this.parent = this.consumedType[resolved];

            if(ast.id) {
                this.id = ast.id;
                this._id[ast.id] = this;
            }

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
            //this.analyzeExpressionDep();
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
                if(p.type == 'QObject') {
                    // create a sandbox for children
                    let created = new ClassIR({scriptPath: '',
                        consumedType: this.consumedType,
                        noCache: this.noCache,
                        silent: false,
                        env: this.env
                    }, null);
                    // share import solver
                    created.importSolver = this.importSolver;
                    created.filename = this.filename;
                    created.consumeObjectAST(p.value, `${this.objName}_${p.name}`);
                    this.props[p.name].value = created;
                }
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
            let attrName = attr.name.split('.')[0];
            let prop = this.parent.getProperty(attrName);
            if(prop) {
                if(attr.name in this.attributes)
                    throw new Error(`Re-assign to attribute ${attr.name} (${this.filename})`);
                this.attributes[attr.name] = {
                    ptype: prop.type, 
                    type: attr.type, 
                    value: attr.value
                };
                if(attr.type === 'QObject') {
                    // create a sandbox for children
                    let created = new ClassIR({scriptPath: '',
                        consumedType: this.consumedType,
                        noCache: this.noCache,
                        silent: false,
                        env: this.env
                    }, null);
                    // share import solver
                    created.importSolver = this.importSolver;
                    created.filename = this.filename;
                    created.consumeObjectAST(attr.value, `${this.objName}_${attr.name}`);
                    this.attributes[attr.name].value = created;
                }
                
            } else
                throw new Error(`Property ${attrName} does not exist in base class (${this.filename})`);
        }

    }

    consumeChildren(children) {
        for(let child of children) {

            // create a sandbox for children
            let childIR = new ClassIR({scriptPath: '',
                consumedType: this.consumedType,
                noCache: this.noCache,
                silent: false,
                env: this.env
            }, this);
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
            let scope = [...this.env, ...fvalue.params.map(x => x.name)];
            fvalue.scope = scope;
        }

    }

    analyzeHandlerDep() {
        for(let [fname, fvalue] of Object.entries(this.handlers)) {
            let ast = parseFunction(fvalue.src);
            let scope = [...this.env, ...fvalue.params.map(x => x.name)];
            fvalue.scope = scope;
        }

    }


    analyzeExpressionDep() {
        let scope = this.env;
        for(let [pname, pvalue] of Object.entries(this.props)) {
            if(pvalue.type === 'Expression') {
                let expr = pvalue.value.trim();
                let ast = parseExpression(expr);
                
                let deps = ast.dep?ast.dep: [];
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
                let deps = ast.dep?ast.dep: [];
                let thisDeps = [];
                for(let dep of deps) {
                    if(this.has(dep.split('.')[0])) {
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
            let ast = parseFile(filename, this.noCache);

            filename = filename.substring(filename.lastIndexOf('/')+1, filename.lastIndexOf('.qml'));

            this.consumeQMLFileAST(ast, filename);
        } else
            throw new Error(`File ${filename} not found`);
    }

    resolve(id, exclude) {
        let ret = this._id[id];
        if(!ret) {
            for(let child of this.children) {
                if(child !== exclude)
                    ret = child.resolve(id, this);
                if(ret)
                    break;
            }
            if(!ret && this.parentNode && this.parentNode !== exclude) {
                ret = this.parentNode.resolve(id, this);
            }

            this._id[id] = ret;
        }
        
        return ret;
    }
}

