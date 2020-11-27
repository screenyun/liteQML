export function polyfill() {
    if(!('setTimeout' in globalThis)) {
        globalThis.setTimeout = os.setTimeout;
    }

    if(!('clearTimeout' in globalThis)) {
        globalThis.clearTimeout = os.clearTimeout;
    }

    if(!('process' in globalThis))
        globalThis.process = {};

    if(!process.argv && scriptArgs)
        process.argv = scriptArgs;
}


// TODO Use class decorator
export function inheritSummary(prototype, summary) {
    let ret = {...prototype.summary};
    ret.props = ret.props.concat(summary.props);
    ret.functions = ret.functions.concat(summary.functions);
    ret.signals = ret.signals.concat(summary.signals);
    return ret;
}

// TODO Use event queue
export class EventEmitter {
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
EventEmitter.summary = {
    props: [],
    signals: [],
    functions: [],
    deps: []
};

export class PropertyStorage {
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
PropertyStorage.summary = {
    props: [],
    signals: [],
    functions: [],
    deps: []
};

export function Binding(expr, ctx, thisDep, globalDep) {
    return {
        context: ctx,
        expr: expr.bind(ctx),
        thisDep: thisDep,
        globalDep: globalDep,
        // TODO This is ugly
        bindingMark: true
    };
}

export class CoreObject {
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

CoreObject.summary = {
    props: ['parent', 'children'],
    signals: ['completed', 'parentChanged'],
    functions: ['appendChild', 'addSignal', 'hasProperty', 'has'],
    deps: [EventEmitter, PropertyStorage]
};


// When calling with chained member notation like chainConnect(this, "a.b");
// it will track dependancies.
export function chainConnect(target, memberNotation, callback) {
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

/*
export class Animation extends CoreObject {
    constructor(parent) {
        super(parent);
        this.addSignal('started');
        this.addSignal('stopped');
        this.addSignal('finished');

        this.addProperty('loops');
        this.addProperty('paused');
        this.addProperty('running');

        this.loops = false;
        this.paused = false;
        this.running = false;

    }
}

Animation.summary = inheritSummary(CoreObject, {
    signals: ['started', 'stopped', 'finished'],
    props: ['loops', 'paused', 'running'],
    functions: []
});

export class PropertyAnimation extends Animation {
    constructor(parent) {
        super(parent);
        this.addProperty('target');
        this.addProperty('property');
        this.addProperty('duration');

        this.targetChanged.connect(this._installAnimation.bind(this));
        this.propertyChanged.connect(this._installAnimation.bind(this));
        this.runningChanged.connect(() => {
            if(this.running)
                this._installAnimation();
        });

        this.target = null;
        this.property = '';
        this.duration = 1000;
    }


    // need better implementation
    _installAnimation() {
        if(this.target instanceof CoreObject && this.running) {
            if(this.target.hasProperty(this.property)) {
                this.running = true;
                this.started.emit();
                this._timestamp = Date.now();
                let cbk = () =>{
                    if(!this.running) {
                        this.stopped.emit();
                        return;
                    }
                    let t = (Date.now() - this._timestamp) / this.duration;
                    if(t>1.0) {
                        this.target[this.property] = this.interpolate(1);
                        clearTimeout(this._timer);
                        this._timer = undefined;
                        this.running = false;
                        this.finished.emit();
                        return;
                    }
                    this.target[this.property] = this.interpolate(t);
                    this._timer = setTimeout(cbk, 10);
                };
                this._timer = setTimeout(cbk, 10);
            }
        }
    }

}

PropertyAnimation.summary = inheritSummary(Animation, {
    props: ['target', 'property', 'duration'],
    signals: ['targetChanged', 'propertyChanged', 'durationChanged'],
    functions: ['_installAnimation']
});

export class NumberAnimation extends PropertyAnimation {
    constructor(parent) {
        super(parent);

        this.addProperty('from');
        this.addProperty('to');

        this.from = 0;
        this.to = 1;
    }

    interpolate(t) {
        return this.from + (this.to - this.from) * t;
    }

};


NumberAnimation.summary = inheritSummary(PropertyAnimation, {
    props: ['from', 'to'],
    signals: ['fromChanged', 'toChanged'],
    functions: ['interpolate']
});
*/
