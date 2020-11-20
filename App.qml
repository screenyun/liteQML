import qmlcore 1.0
import browser.qmlcore 1.0

Rectangle {
    id: root
    color: "white"

    Image {
        id: rect
        width: 100
        height: 100
        source: './img.png'
    }
    Button {
        x: 200
        y: 300
        width: 100
        height: 50
        color: hovered? "red": "blue"
        text: "羅凱旋"
        img: Image {
            
        }

        onClicked: {
            let myrect = rect;
            myrect.visible = !myrect.visible;
            console.log(root.img.source)
        }
    }

}
