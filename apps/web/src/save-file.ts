// Hands a blob to the browser as a download.
//
// This is the one place in the front that reaches the DOM outside React. An
// object URL and a synthetic click are how a page asks a browser to save a
// response it fetched itself; there is no declarative equivalent, and hiding it
// inside a component would put an untestable side effect in the middle of a
// render tree.
//
// It is a type as well as a function so a test can pass its own and assert on
// what was saved without a jsdom that implements object URLs.
export type SaveFile = (blob: Blob, filename: string) => void;

export const saveFile: SaveFile = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();

    // Released straight away: the browser already holds the download, and an
    // object URL that is never revoked keeps its blob in memory for as long as
    // the document lives.
    URL.revokeObjectURL(url);
};
