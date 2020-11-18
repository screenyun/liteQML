import qmlcore 1.0
import browser.qmlcore 1.0

Item {
    Rectangle {
        width: parent.width
        height: parent.height
        color: "black"
    }

    Rectangle {
        x: 100
        y: 100
        width: 50
        height: 50
        color: "white"

        Timer {
            repeat: true
            running: true
            interval: 100
            onTriggered: {
                parent.rotation+=10
            }

        }
    }

}
