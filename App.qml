import qmlcore 1.0
import browser.qmlcore 1.0

Rectangle {
    id: root
    color: "white"
    property Image img: Image {}
    
    Rectangle {
        x: rect.x
        width: 10
        height: 10
        color: "red"

        onXChanged: {
            console.log('fuck')
        }
    }



    Rectangle {
        width: 100
        height: 100
        color: "black"

        Rectangle {
            id: rect
            anchors.centerIn: parent
            width: 10
            height: 10
        }

        MouseArea {
            width: parent.width
            height: parent.height

            onClicked: {
                parent.width+=50
            }
        }
    }

}
