CoreObject {
    property int x
    property int y

    property int width
    property int height

    property real rotation
    property bool clip

    property bool visible: true

    property Anchors anchors: Anchors {}
    property real verticalCenter: height / 2
    property real horizontalCenter: width / 2

    function draw(layer) {
        if(visible) {
            this.drawImpl(layer)
        }
    }

    function drawImpl(layer) {
        let scene = layer.scene,
        ctx = scene.context;

        this.beginNode(layer);

        this.drawChildren(layer);
        this.endNode(layer);
    }

    
    function beginNode(layer) {
        let ctxScene = layer.scene.context;
        let ctxHit = layer.hit.context;

        ctxScene.save();
        ctxHit.save();
        ctxScene.translate(x+width/2, y+height/2);
        ctxScene.rotate(rotation * 3.14159 / 180);
        ctxHit.translate(x+width/2, y+height/2);
        ctxHit.rotate(rotation * 3.14159 / 180);

        if(clip) {
            this.outline(ctxScene);
            ctxScene.clip();

            this.outline(ctxHit);
            ctxHit.clip();
        }
    }

    function endNode(layer) {
        let ctxScene = layer.scene.context;
        let ctxHit = layer.hit.context;

        ctxScene.restore();
        ctxHit.restore();
    }

    function outline(ctx) {
        ctx.beginPath();
        ctx.rect(-width/2, -height/2, width, height);
    }

    function drawChildren(layer) {
        let ctxScene = layer.scene.context;
        let ctxHit = layer.hit.context;
        ctxScene.save();
        ctxHit.save();
        ctxScene.translate(-this.width/2, -this.height/2);
        ctxHit.translate(-this.width/2, -this.height/2);
        for(let i=0; i<this.children.length; i++) {
            if(this.children[i] instanceof Item) {
                this.children[i].draw(layer);
            }
        }
        ctxScene.restore();
        ctxHit.restore();
    }

}
