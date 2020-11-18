import qmlcore 1.0
import browser.qmlcore 1.0

Rectangle {
    x: 100
    y: 100+x
    width: 100
    height: 100
    color: "black"
    radius: 10

    Text {
        color: "white"
        text: '羅凱旋'
        rotation: 45
    }

    MouseArea {
        width: 100
        height: 100
        onClicked: {
            let parent = this.parent;
            parent.x+=10
        }
    }

    Timer {
        running: true
        repeat: true
        interval: 100
        onTriggered: {
            parent.rotation+=10;
        }
    }

    onXChanged: {
        console.log(this.x)
    }

    onCompleted: {
    }
}
