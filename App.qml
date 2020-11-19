import qmlcore 1.0
import browser.qmlcore 1.0

Rectangle {
    color: "white"
    Button {
        x: 200
        y: 300
        width: 100
        height: 50
        color: hovered? "red": "blue"
        text: "羅凱旋"

        onClicked: {
            rotation+=10;
        }
    }

}
