Item {
    property string source

    function drawImpl(layer) {
        let scene = layer.scene,
        ctx = scene.context;
        this.beginNode(layer);
        if(this._imgElement) 
            ctx.drawImage(this._imgElement, -this.width/2, -this.height/2);
        this.drawChildren(layer);
        this.endNode(layer);
    }

    onSourceChanged: {
        if(!this._imgElement)
            this._imgElement = document.createElement('img');
        this._imgElement.src = source;
        this._imgElement.onload = function () {
            width = this._imgElement.naturalWidth;
            height = this._imgElement.naturalHeight;
        }.bind(this)
    }
}

