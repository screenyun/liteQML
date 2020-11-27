CoreObject {
    property CoreObject centerIn
    property CoreObject fill
    property real verticalCenter
    property real horizontalCenter


    onCenterInChanged: {
        parent.x = Binding(function() { 
            return centerIn.width / 2 - parent.width / 2;
        }.bind(this), this, ['centerIn.width', 'parent.width']);
        parent.y = Binding(function() {
            return centerIn.height / 2 - parent.height / 2
        }.bind(this), this, ['centerIn.height', 'parent.height']);
    }

    onFillChanged: {
        parent.width = Binding(function() { 
            return fill.width;
        }.bind(this), this, ['fill.width']);
        parent.height = Binding(function() { 
            return fill.height;
        }.bind(this), this, ['fill.height']);
    }

    onHorizontalCenterChanged: {
        parent.x = horizontalCenter - parent.width / 2;
    }

    onVerticalCenterChanged: {
        parent.y = verticalCenter - parent.height / 2;
    }

}