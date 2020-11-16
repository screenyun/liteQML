Item {
    property real radius
    property color color: "white"
    function draw(layer) {
        let scene = layer.scene,
        ctx = scene.context;
        this.beginNode(layer);
        this.roundRect(ctx, -width/2, -height/2, width, height, radius);
        ctx.fillStyle = color;
        ctx.fill();
        
        this.drawChildren(layer);
        this.endNode(layer);
    }

    function outline(ctx) {
        this.roundRect(ctx, -width/2, -height/2, width, height, radius);
    }

    function roundRect(ctx, x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        ctx.beginPath();
        ctx.moveTo(x+r, y);
        ctx.arcTo(x+w, y,   x+w, y+h, r);
        ctx.arcTo(x+w, y+h, x,   y+h, r);
        ctx.arcTo(x,   y+h, x,   y,   r);
        ctx.arcTo(x,   y,   x+w, y,   r);
        ctx.closePath();
        return ctx;
    }
}
