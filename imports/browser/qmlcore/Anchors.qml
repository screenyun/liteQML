CoreObject {
    property CoreObject centerIn: null

    onCenterInChanged: {
        console.log('here')
        parent.x = Binding(function() { 
            return centerIn.width / 2 - parent.width / 2;
        }.bind(this), this, ['centerIn.width', 'parent.width']);
        parent.y = Binding(function() {
            return centerIn.height / 2 - parent.height / 2
        }.bind(this), this, ['centerIn.height', 'parent.height']);
    }
}