CoreObject {
    signal triggered()
    property int interval: 1000
    property bool repeat
    property bool running

    onRunningChanged: {
        if(running) {
            let cbk = function() {
                this.triggered.emit();
                if(this.repeat)
                    setTimeout(cbk, this.interval);
            }.bind(this);
            
            this._t = setTimeout(cbk, interval);
        }
    }

}