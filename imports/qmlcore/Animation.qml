CoreObject {
    signal started()
    signal stopped()
    signal finished()

    property bool loops
    property bool paused
    property bool running
}