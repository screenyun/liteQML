PropertyAnimation {
    property real from: 0
    property real to: 1

    function snapshot() {
        this._from = from;
        this._to = to;
    }

    function interpolate(t) {
        return this._from + (this._to - this._from) * t;
    }
}