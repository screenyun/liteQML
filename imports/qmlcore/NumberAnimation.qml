PropertyAnimation {
    property real from: 0
    property real to: 1

    function interpolate(t) {
        return this.from + (this.to - this.from) * t;
    }
}