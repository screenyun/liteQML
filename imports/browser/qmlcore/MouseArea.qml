Item {
    signal positionChanged()
    signal clicked()
    
    property bool containsMouse
    property real mouseX
    property real mouseY
    
    function draw(layer) {
        let hit = layer.hit,
        ctx = hit.context;

        this.beginNode(layer);
        ctx.beginPath();
        
        ctx.rect(-width/2, -height/2, width, height);
        ctx.fillStyle = hit.getColorFromIndex(this.key);
        ctx.fill();
        
        this.drawChildren(layer);
        this.endNode(layer);
    }

    onCompleted: {
        
        if(window.qml.mouseArea===undefined) {
            window.qml.mouseArea = 0
            window.qml.mouseAreas = [this]
        } else
            window.qml.mouseArea++
        this.key = window.qml.mouseArea
        window.qml.mouseAreas.push(this);
    }

    function mouseMoved() {
        this.positionChanged.emit();
    }

    function mouseClicked() {
        this.clicked.emit();
    }

}
