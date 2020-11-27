
async function polyfill() {
    let fs = await import('fs').catch(() => {})
    if(fs) {
        // node
        globalThis.fs = fs;
    } else {
        // qjs
        
        globalThis.os = await import('os').catch(() => {})
        globalThis.std = await import('std').catch(() => {})
        
    }
    if(!('setTimeout' in globalThis)) {
        globalThis.setTimeout = os.setTimeout;
    }

    if(!('clearTimeout' in globalThis)) {
        globalThis.clearTimeout = os.clearTimeout;
    }
    

    if(!('process' in globalThis)) {
        globalThis.process = {};
        process.cwd = function() { return os.getcwd()[0]; }
    }
        

    if(!process.argv && 'scriptArgs' in globalThis)
        process.argv = ['qjs', ...scriptArgs];

    if(!('info' in console))
        console.info = console.log
}
function Binding(expr, ctx, thisDep, globalDep) {
    return {
        context: ctx,
        expr: expr.bind(ctx),
        thisDep: thisDep,
        globalDep: globalDep,
        // TODO This is ugly
        bindingMark: true
    };
}
function chainConnect(target, memberNotation, callback) {
    if(!target) {
        console.log('target not found')
        return () => {};
    }
    let dotPos = memberNotation.indexOf('.');
    if(dotPos >= 0) {
        let member = memberNotation.substr(0, dotPos);
        if(target.hasProperty(member)) {
            let subNotation = memberNotation.slice(dotPos+1);
            let childDispose = chainConnect(target[`${member}`], subNotation, callback);

            let cbk = () => {
                console.log('wtf')
                // chain dispose
                childDispose();

                // reconnect
                childDispose = chainConnect(target[`${member}`], subNotation, callback);

                // re-eval in this level
                callback();

            };

            let dispose = () => {
                target[`${member}Changed`].disconnect(cbk);
                childDispose();
            };
            target[`${member}Changed`].connect(cbk);
            return dispose;
        }
    } else {
        let member = memberNotation;
        if(target.hasProperty(member)) {
            target[`${member}Changed`].connect(callback);
            return () =>
                target[`${member}Changed`].disconnect(callback);
        } else 
            throw new Error('No such property');
    }
}
class EventEmitter {
    constructor() {
        this.handlers = [];
    }

    connect(handler) {
        if(handler === undefined)
            debugger
        this.handlers.push(handler);
    }

    disconnect(handler) {
        let idx = this.handlers.indexOf(handler);
        if(idx>=0)
            this.handlers.splice(idx, 1);
    }

    emit(...args) {
        // iterate from copied handlers to prevent updating to handlers at the same time
        for(let x of [...this.handlers])
            x(...args);
    }
}
class PropertyStorage {
    constructor(owner, signal) {
        this._owner = owner;
        this._signal = signal;
        this._dispose = [];
        this._context = owner;
        this.assign(null);
    }

    evaluate() {
        if(this._dirty) {
            this._cache = this._expr();
            this._dirty = false;
        }
        return this._cache;
    }

    assign(expr, context, thisDep, globalDep) {
        // uninitialized will be undefined
        let value = this.evaluate();
        if(expr !== value) {
            this.unregister();
            if(typeof expr === 'function') {
                this._expr = expr;
                this._cache = null;
                
                this._dirty = true;
                this._thisDep = thisDep;
                this._globalDep = globalDep;
                this._context = context;
                this.register();
            } else {
                this._cache = this._expr = expr;
                this._dirty = false;
                this._thisDep = [];
                this._globalDep = [];
            }
            this._signal.emit();
        }
    }

    register() {
        this.unregister();
        let slot = () => {
            this._dirty = true;
            this._signal.emit();
        };
        if(this._thisDep) {
            for(const dep of this._thisDep) {
                this._dispose.push(chainConnect(this._context, dep, slot));
            }
        }
        if(this._globalDep) {
            for(const dep of this._globalDep) {
                let obj = this._owner.resolve(dep.object);
                this._dispose.push(chainConnect(obj, dep.prop, slot));
                if(this._dispose[this._dispose.length-1]===undefined)
                    debugger;
            }
        }
    }

    unregister() {
        for(const d of this._dispose) {
            d();
        }
        this._dispose = [];
    }
}
class CoreObject {
    constructor(parent) {
        
        this.children = [];
        this._id = {};
        this._properties = [];
        this.addProperty('parent');
        this.parent = parent? parent: null;
    }

    appendChild(child) {
        child.parent = this;
        this.children.push(child);
    }

    // TODO This might have performance issue
    addProperty(name) {
        let signal = this.addSignal(`${name}Changed`);
        this[`_${name}`] = new PropertyStorage(this, signal);
        this._properties.push(name);

        Object.defineProperty(this, name, {
            get: function() {
                return this[`_${name}`].evaluate();
            },
            set: function(val) {
                if(val && typeof val === 'object' && val.bindingMark) {
                    // expr binding
                    this[`_${name}`].assign(val.expr, val.context, val.thisDep, val.globalDep);
                } else
                    this[`_${name}`].assign(val);
            }
        });
    }

    addSignal(name) {
        Object.defineProperty(this, name, {
            value: new EventEmitter(),
            writable: false,
            configurable: false,
            enumerable: true
        });
        return this[name];
    }

    hasProperty(prop) {
        return this._properties.indexOf(prop) >= -1;
    }

    has(name) {
        return name in this || this.hasProperty(name);
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
            if(!ret && this.parent && this.parent !== exclude) {
                ret = this.parent.resolve(id, this);
            }

            this._id[id] = ret;
        }
        
        return ret;
    }

    registerAll() {
        for(const prop of this._properties) {
            this[`_${prop}`].register();
        }
    }
}

class App extends CoreObject {
    constructor(parent, params) {
        super(parent, params);
        this._id['root']=this;
        this.addProperty('x');
        this.x = params && params.x? params.x: 100;

        this.registerAll();

    }


}

polyfill().then(() => {
    window.qml = {};
    window.qml.rootObject = new App();
});
