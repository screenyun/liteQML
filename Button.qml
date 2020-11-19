import qmlcore 1.0
import browser.qmlcore 1.0

Rectangle {
    signal clicked()
    radius: 10
    property string text
    property bool hovered: ma.containsMouse

    Text {
        color: "black"
        text: parent.text
    }

    MouseArea {
        id: ma
        width: parent.width
        height: parent.height

        onClicked: {
            parent.clicked.emit()
        }
    }
}
