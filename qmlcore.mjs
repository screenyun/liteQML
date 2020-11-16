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
        this.handlers.push(handler);
    }

    disconnect(handler) {
        let idx = this.handlers.indexOf(handler);
        if(idx>=0)
            this.handlers.splice(idx, 1);
    }

    emit(...args) {
        for(let x of this.handlers)
            x(...args);
    }
}
EventEmitter.summary = {
    props: [],
    signals: [],
    functions: [],
    deps: []
};

export class CoreObject {
    constructor(parent) {
        this.addProperty('parent');
        this.children = [];
        this.parent = parent? parent: null;
    }

    appendChild(child) {
        this.children.push(child);
    }

    // TODO This might have performance issue
    addProperty(name) {
        this.addSignal(`${name}Changed`);

        Object.defineProperty(this, name, {
            get: function() {
                return this[`_${name}Dirty`]? this[`_${name}Closure`](): this[`_${name}`];
            },
            set: function(val) {
                let ref = this[`_${name}`];
                if(val != ref) {
                    // this is okay, if we only pass lambda or literal
                    if(typeof val == 'function') {
                        this[`_${name}Closure`] = () => {
                            this[`_${name}Dirty`] = false;
                            return this[`_${name}`] = val();
                        };
                        this[`_${name}Dirty`] = true;
                    } else {
                        this[`_${name}`] = val;
                        this[`_${name}Dirty`] = false;
                    }
                    this[`${name}Changed`].emit();
                }
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
    }

    hasProperty(prop) {
        let desc = Object.getOwnPropertyDescriptor(this, prop);
        return desc && desc.set && desc.get && this[`_${prop}`]!==undefined;
    }

    has(name) {
        return name in this || this.hasProperty(name);
    }
}

CoreObject.summary = {
    props: ['parent', 'children'],
    signals: ['completed'],
    functions: ['appendChild', 'addSignal', 'hasProperty', 'has'],
    deps: [EventEmitter]
};


// When calling with chained member notation like chainConnect(this, "a.b");
// it will track dependancies.
export function chainConnect(target, memberNotation, callback) {
    let dotPos = memberNotation.indexOf('.');
    if(dotPos >= 0) {
        let member = memberNotation.substr(0, dotPos);
        if(target.hasProperty(member)) {
            let subNotation = memberNotation.slice(dotPos+1);
            let childDispose = chainConnect(target[`${member}`], subNotation, callback);

            let cbk = () => {
                // chain dispose
                childDispose();

                // reconnect
                childDispose = chainConnect(target[`${member}`], subNotation);

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
        }
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
