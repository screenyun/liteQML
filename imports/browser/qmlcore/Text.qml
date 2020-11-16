Item {
    property string text
    property color color


    function draw(layer) {
        let scene = layer.scene,
        ctx = scene.context;

        let txt = ctx.measureText(text);
        this.width = txt.width
        this.height = txt.actualBoundingBoxAscent + txt.actualBoundingBoxDescent

        this.beginNode(layer);

        ctx.fillStyle = color;
        ctx.fillText(text, -this.width/2, this.height/2);
        
        this.drawChildren(layer);
        this.endNode(layer);
    }
}