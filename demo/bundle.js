
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

class Anchors extends CoreObject {
    constructor(parent, params) {
        super(parent, params);
        this.addProperty('centerIn');
        this.addProperty('fill');
        this.addProperty('verticalCenter');
        this.addProperty('horizontalCenter');
        this.centerInChanged.connect(this.onCenterInChanged.bind(this));
        this.fillChanged.connect(this.onFillChanged.bind(this));
        this.horizontalCenterChanged.connect(this.onHorizontalCenterChanged.bind(this));
        this.verticalCenterChanged.connect(this.onVerticalCenterChanged.bind(this));
        this.centerIn = params && params.centerIn? params.centerIn: null;
        this.fill = params && params.fill? params.fill: null;
        this.verticalCenter = params && params.verticalCenter? params.verticalCenter: 0;
        this.horizontalCenter = params && params.horizontalCenter? params.horizontalCenter: 0;

        this.registerAll();

    }

    onCenterInChanged() { 
    {
        this.parent.x = Binding((function () {return ((this.centerIn.width / 2) - (this.parent.width / 2));}).bind(this), this, ['centerIn.width', 'parent.width']);
        this.parent.y = Binding((function () {return ((this.centerIn.height / 2) - (this.parent.height / 2));}).bind(this), this, ['centerIn.height', 'parent.height']);

    }


    }
    onFillChanged() { 
    {
        this.parent.width = Binding((function () {return this.fill.width;}).bind(this), this, ['fill.width']);
        this.parent.height = Binding((function () {return this.fill.height;}).bind(this), this, ['fill.height']);

    }


    }
    onHorizontalCenterChanged() { 
    this.parent.x = (this.horizontalCenter - (this.parent.width / 2));




    }
    onVerticalCenterChanged() { 
    this.parent.y = (this.verticalCenter - (this.parent.height / 2));




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
        this.addProperty('verticalCenter');
        this.addProperty('horizontalCenter');
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

                this.registerAll();

            }


        }
        this.anchors = params && params.anchors? params.anchors: new Item_anchors(this);
        this.verticalCenter = params && params.verticalCenter? params.verticalCenter: Binding(() => { return (this.height / 2); }, this, ["height"], []);
        this.horizontalCenter = params && params.horizontalCenter? params.horizontalCenter: Binding(() => { return (this.width / 2); }, this, ["width"], []);

        this.registerAll();

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

class Image extends Item {
    constructor(parent, params) {
        super(parent, params);
        this.addProperty('source');
        this.sourceChanged.connect(this.onSourceChanged.bind(this));
        this.source = params && params.source? params.source: '';

        this.registerAll();

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

class Text extends Item {
    constructor(parent, params) {
        super(parent, params);
        this.addProperty('text');
        this.addProperty('color');
        this.text = params && params.text? params.text: '';
        this.color = params && params.color? params.color: "white";

        this.registerAll();

    }
    drawImpl(layer) {
    {
        let scene=layer.scene, ctx=scene.context
        let txt=ctx.measureText(this.text)
        this.width = txt.width;
        this.height = (txt.actualBoundingBoxAscent + txt.actualBoundingBoxDescent);
        this.beginNode(layer);
        ctx.fillStyle = this.color;
        ctx.fillText(this.text, (-this.width / 2), (this.height / 2));
        this.drawChildren(layer);
        this.endNode(layer);

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

        this.registerAll();

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

        this.registerAll();
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
        globalThis.window.qml.mouseArea++;
        this.key = window.qml.mouseArea;
        window.qml.mouseAreas.push(this);

    }




    }

}

class App extends Item {
    constructor(parent, params) {
        super(parent, params);
        this.addSignal('positionChanged');
        this.addSignal('clicked');
        this.width = 500;
        this.height = 500;

        class App_Image_0 extends Image {
            constructor(parent, params) {
                super(parent, params);
                this._id['ball']=this;
                this.x = 100;
                this.y = 100;
                this.width = 200;
                this.height = 200;
                this.source = 'https://apng.onevcat.com/assets/elephant.gif';

                this.registerAll();

            }


        }
        this.appendChild(new App_Image_0(this));

        class App_Text_1 extends Text {
            constructor(parent, params) {
                super(parent, params);
                this._id['helloText']=this;
                this.text = 'Hello world!';
                this.color = 'balck';
                this.anchors.verticalCenter = Binding(() => { return this.parent.verticalCenter; }, this, ["parent.verticalCenter"], []);
                this.anchors.horizontalCenter = Binding(() => { return this.parent.horizontalCenter; }, this, ["parent.horizontalCenter"], []);

                this.registerAll();

            }


        }
        this.appendChild(new App_Text_1(this));

        class App_Rectangle_2 extends Rectangle {
            constructor(parent, params) {
                super(parent, params);
                this.addProperty('moved');
                this.moved = params && params.moved? params.moved: false;
                this.x = Binding(() => { return this.moved?190:10; }, this, ["moved"], []);
                this.y = 50;
                this.width = 200;
                this.height = 200;
                this.color = 'red';

                class App_Rectangle_2_MouseArea_0 extends MouseArea {
                    constructor(parent, params) {
                        super(parent, params);
                        this.clicked.connect(this.onClicked.bind(this));
                        this.anchors.fill = Binding(() => { return this.parent; }, this, ["parent"], []);

                        this.registerAll();

                    }

                    onClicked() { 
                    {
                        this.clicked.emit();
                        console.log('mouseClicked');

                    }


                    }

                }
                this.appendChild(new App_Rectangle_2_MouseArea_0(this));

                this.registerAll();

            }


        }
        this.appendChild(new App_Rectangle_2(this));

        this.registerAll();

    }


}

polyfill().then(() => {
    if(!('window' in globalThis)) {
        globalThis.window = {};
    }
    window.qml = {};
    window.qml.rootObject = new App();
});
