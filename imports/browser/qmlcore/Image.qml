Item {
    property string source

    function draw(layer) {
        let scene = layer.scene,
        ctx = scene.context;
        this.beginNode(layer);
        if(this.imgElement) 
            ctx.drawImage(this.imgElement, -this.width/2, -this.height/2);
        
        
        this.drawChildren(layer);
        this.endNode(layer);
    }

    function onSourceChanged() {
        if(!this.imgElement)
            this.imgElement = document.createElement('img');
        this.imgElement.src = source;
        this.imgElement.onload = function () {

            this.width = this.imgElement.naturalWidth;
            this.height = this.imgElement.naturalHeight;
        }.bind(this)


    }

}