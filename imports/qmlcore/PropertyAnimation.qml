Animation {
    property CoreObject target: null
    property string property
    property int duration: 1000

    function onCompleted() {
        this.targetChanged.connect(this._installAnimation.bind(this));
        this.propertyChanged.connect(this._installAnimation.bind(this));
        this.runningChanged.connect(function() {
            if(this.running)
                this._installAnimation();
        }.bind(this));
    }

    function _installAnimation() {
        if(this.target instanceof CoreObject && this.running) {
            if(this.target.hasProperty(this.property)) {
                this.running = true;
                this.started.emit();
                this._timestamp = Date.now();
                let cbk = function () {
                    if(!this.running) {
                        this.stopped.emit();
                        return;
                    }
                    let t = (Date.now() - this._timestamp) / this.duration;
                    if(t>1.0) {
                        this.target[this.property] = this.interpolate(1);
                        clearTimeout(this._timer);
                        this._timer = undefined;
                        this.running = false;
                        this.finished.emit();
                        return;
                    }
                    this.target[this.property] = this.interpolate(t);
                    this._timer = setTimeout(cbk, 10);
                }.bind(this);
                this._timer = setTimeout(cbk, 10);
            }
        }

    }
}
