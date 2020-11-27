Test {
    id: root
    property int z: 300
    x: z+y+200
    property int y: 200

    onXChanged: {
        console.log(x);
    }

    onCompleted: {
        y+=200;
        console.log('shit')
    }
    
}
