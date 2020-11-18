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
        radius: 10

        MouseArea {
            width: parent.width
            height: parent.height
            
            onContainsMouseChanged: {
                parent.color = containsMouse? "red": "white"
            }

            onPositionChanged: {
                let parent = this.parent;
                parent.x = mouseX - parent.width / 2 
                parent.y = mouseY - parent.height / 2
            }
        }

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
