
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
    if(!target)
        return () => {};
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
        }
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
                this.register(context);
            } else {
                this._cache = this._expr = expr;
                this._dirty = false;
                // uncessary to clear globalDep and thisDep
            }
            this._signal.emit();
        }
    }

    register(context) {
        let slot = () => {
            this._dirty = true;
            this._signal.emit();
        };
        if(this._thisDep) {
            for(const dep of this._thisDep)
                this._dispose.push(chainConnect(context, dep, slot));
        }
        if(this._globalDep) {
            for(const dep of this._globalDep) {
                let obj = this._owner.resolve(dep.object);
                this._dispose.push(chainConnect(obj, dep.prop, slot));
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
        this.addProperty('parent');
        this.children = [];
        this.parent = parent? parent: null;
        this._id = {};
    }

    appendChild(child) {
        child.parent = this;
        this.children.push(child);
    }

    // TODO This might have performance issue
    addProperty(name) {
        let signal = this.addSignal(`${name}Changed`);
        this[`_${name}`] = new PropertyStorage(this, signal);

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
        let desc = Object.getOwnPropertyDescriptor(this, prop);
        return desc && desc.set && desc.get && this[`_${prop}`]!==undefined;
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
}

class Anchors extends CoreObject {
    constructor(parent, params) {
        super(parent, params);
        this.addProperty('centerIn');
        this.centerInChanged.connect(this.onCenterInChanged.bind(this));
        this.centerIn = params && params.centerIn? params.centerIn: null;

    }

    onCenterInChanged() { 
    {
        console.log('here');
        this.parent.x = Binding((function () {return ((this.centerIn.width / 2) - (this.parent.width / 2));}).bind(this), this, ['centerIn.width', 'parent.width']);
        this.parent.y = Binding((function () {return ((this.centerIn.height / 2) - (this.parent.height / 2));}).bind(this), this, ['centerIn.height', 'parent.height']);

    }


    }

}

class Item extends CoreObject {
    constructor(parent, params) {
        super(parent, params);
        this.addProperty('x');
        this.addProperty('y');
        this.addProperty('width');
        this.addProperty('height');
        this.addProperty('rotation');
        this.addProperty('clip');
        this.addProperty('visible');
        this.addProperty('anchors');
        this.x = params && params.x? params.x: 0;
        this.y = params && params.y? params.y: 0;
        this.width = params && params.width? params.width: 0;
        this.height = params && params.height? params.height: 0;
        this.rotation = params && params.rotation? params.rotation: 0;
        this.clip = params && params.clip? params.clip: false;
        this.visible = params && params.visible? params.visible: true;

        class Item_anchors extends Anchors {
            constructor(parent, params) {
                super(parent, params);

            }


        }
        this.anchors = params && params.anchors? params.anchors: new Item_anchors(this);

    }
    draw(layer) {
    if (this.visible) this.drawImpl(layer); 


    }
    drawImpl(layer) {
    {
        let scene=layer.scene, ctx=scene.context
        this.beginNode(layer);
        this.drawChildren(layer);
        this.endNode(layer);

    }
    }
    beginNode(layer) {
    {
        let ctxScene=layer.scene.context
        let ctxHit=layer.hit.context
        ctxScene.save();
        ctxHit.save();
        ctxScene.translate((this.x + (this.width / 2)), (this.y + (this.height / 2)));
        ctxScene.rotate(((this.rotation * 3.14159) / 180));
        ctxHit.translate((this.x + (this.width / 2)), (this.y + (this.height / 2)));
        ctxHit.rotate(((this.rotation * 3.14159) / 180));
        if (this.clip) {
            this.outline(ctxScene);
            ctxScene.clip();
            this.outline(ctxHit);
            ctxHit.clip();

        } 

    }
    }
    endNode(layer) {
    {
        let ctxScene=layer.scene.context
        let ctxHit=layer.hit.context
        ctxScene.restore();
        ctxHit.restore();

    }
    }
    outline(ctx) {
    {
        ctx.beginPath();
        ctx.rect((-this.width / 2), (-this.height / 2), this.width, this.height);

    }
    }
    drawChildren(layer) {
    {
        let ctxScene=layer.scene.context
        let ctxHit=layer.hit.context
        ctxScene.save();
        ctxHit.save();
        ctxScene.translate((-this.width / 2), (-this.height / 2));
        ctxHit.translate((-this.width / 2), (-this.height / 2));
        for(let i=0; (i < this.children.length); i++)
            if ((this.children[i] instanceof Item)) this.children[i].draw(layer); 


        ctxScene.restore();
        ctxHit.restore();

    }
    }


}

class Rectangle extends Item {
    constructor(parent, params) {
        super(parent, params);
        this.addProperty('radius');
        this.addProperty('color');
        this.radius = params && params.radius? params.radius: 0;
        this.color = params && params.color? params.color: 'white';

    }
    drawImpl(layer) {
    {
        let scene=layer.scene, ctx=scene.context
        this.beginNode(layer);
        this.roundRect(ctx, (-this.width / 2), (-this.height / 2), this.width, this.height, this.radius);
        ctx.fillStyle = this.color;
        ctx.fill();
        this.drawChildren(layer);
        this.endNode(layer);

    }
    }
    outline(ctx) {
    this.roundRect(ctx, (-this.width / 2), (-this.height / 2), this.width, this.height, this.radius);


    }
    roundRect(ctx,x,y,w,h,r) {
    {
        if ((w < (2 * r))) r = (w / 2); 
        if ((h < (2 * r))) r = (h / 2); 
        ctx.beginPath();
        ctx.moveTo((x + r), y);
        ctx.arcTo((x + w), y, (x + w), (y + h), r);
        ctx.arcTo((x + w), (y + h), x, (y + h), r);
        ctx.arcTo(x, (y + h), x, y, r);
        ctx.arcTo(x, y, (x + w), y, r);
        ctx.closePath();
        return ctx;


    }
    }


}

class Image extends Item {
    constructor(parent, params) {
        super(parent, params);
        this.addProperty('source');
        this.sourceChanged.connect(this.onSourceChanged.bind(this));
        this.source = params && params.source? params.source: '';

    }
    drawImpl(layer) {
    {
        let scene=layer.scene, ctx=scene.context
        this.beginNode(layer);
        if (this._imgElement) ctx.drawImage(this._imgElement, (-this.width / 2), (-this.height / 2)); 
        this.drawChildren(layer);
        this.endNode(layer);

    }
    }

    onSourceChanged() { 
    {
        if (!this._imgElement) this._imgElement = document.createElement('img'); 
        this._imgElement.src = this.source;
        this._imgElement.onload = (function () {{
            this.width = this._imgElement.naturalWidth;
            this.height = this._imgElement.naturalHeight;

        }}).bind(this);

    }


    }

}

class MouseArea extends Item {
    constructor(parent, params) {
        super(parent, params);
        this.addProperty('containsMouse');
        this.addProperty('mouseX');
        this.addProperty('mouseY');
        this.addSignal('positionChanged');
        this.addSignal('clicked');
        this.containsMouse = params && params.containsMouse? params.containsMouse: false;
        this.mouseX = params && params.mouseX? params.mouseX: 0;
        this.mouseY = params && params.mouseY? params.mouseY: 0;
        MouseArea.prototype.onCompleted.call(this);

    }
    drawImpl(layer) {
    {
        let hit=layer.hit, ctx=hit.context
        this.beginNode(layer);
        ctx.beginPath();
        ctx.rect((-this.width / 2), (-this.height / 2), this.width, this.height);
        ctx.fillStyle = hit.getColorFromIndex(this.key);
        ctx.fill();
        this.drawChildren(layer);
        this.endNode(layer);

    }
    }
    mouseMoved() {
    this.positionChanged.emit();


    }
    mouseClicked() {
    this.clicked.emit();


    }

    onCompleted() { 
    if ((window.qml.mouseArea === undefined)) {
        window.qml.mouseArea = 0;
        window.qml.mouseAreas = [this];
        this.key = 0;

    } else {
        window.qml.mouseArea++;
        this.key = window.qml.mouseArea;
        window.qml.mouseAreas.push(this);

    }




    }

}

class App extends Rectangle {
    constructor(parent, params) {
        super(parent, params);
        this._id['root']=this;
        this.addProperty('img');

        class App_img extends Image {
            constructor(parent, params) {
                super(parent, params);

            }


        }
        this.img = params && params.img? params.img: new App_img(this);
        this.color = 'white';

        class App_Rectangle_0 extends Rectangle {
            constructor(parent, params) {
                super(parent, params);
                this.xChanged.connect(this.onXChanged.bind(this));
                this.x = Binding(() => { return this.resolve('rect').x; }, this, [], [{"object":"rect","prop":"x"}]);
                this.width = 10;
                this.height = 10;
                this.color = 'red';

            }

            onXChanged() { 
            console.log('fuck');




            }

        }
        this.appendChild(new App_Rectangle_0(this));

        class App_Rectangle_1 extends Rectangle {
            constructor(parent, params) {
                super(parent, params);
                this.width = 100;
                this.height = 100;
                this.color = 'black';

                class App_Rectangle_1_Rectangle_0 extends Rectangle {
                    constructor(parent, params) {
                        super(parent, params);
                        this._id['rect']=this;
                        this.anchors.centerIn = Binding(() => { return this.parent; }, this, ["parent"], []);
                        this.width = 10;
                        this.height = 10;

                    }


                }
                this.appendChild(new App_Rectangle_1_Rectangle_0(this));

                class App_Rectangle_1_MouseArea_1 extends MouseArea {
                    constructor(parent, params) {
                        super(parent, params);
                        this.clicked.connect(this.onClicked.bind(this));
                        this.width = Binding(() => { return this.parent.width; }, this, ["parent.width"], []);
                        this.height = Binding(() => { return this.parent.height; }, this, ["parent.height"], []);

                    }

                    onClicked() { 
                    this.parent.width += 50;




                    }

                }
                this.appendChild(new App_Rectangle_1_MouseArea_1(this));

            }


        }
        this.appendChild(new App_Rectangle_1(this));

    }


}

polyfill().then(() => {
    window.qml = {};
    window.qml.rootObject = new App();
});
