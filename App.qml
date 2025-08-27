import qmlcore  1.0
import browser.qmlcore  1.0

Item {
  signal positionChanged()
  signal clicked()
  width: 500;
  height: 500;

  Image {
      id: ball
      x: 100; y: 100
      width: 200; height: 200
      source: "https://apng.onevcat.com/assets/elephant.gif"
  }

  Text {
    id: helloText
    text: "Hello world!"
    color: 'balck'
    anchors.verticalCenter: parent.verticalCenter
    anchors.horizontalCenter: parent.horizontalCenter
  }

  Rectangle {
    property bool moved
    x: moved ? 190 : 10
    y: 50;
    width: 200;
    height: 200;
    color: "red";

    function mouseMoved() {
      this.positionChanged.emit();
      this.moved = !this.moved;
      console.log('mouseMoved')
    }
	
    function mouseClicked() {
        this.clicked.emit();
		    console.log('mouseClicked')
    }
  }
}