declare module "bunny-build-info" {
    const version: string;
}

declare module "*.png" {
    const str: string;
    export default str;
}

// KETTU MAX: built-in plugin sources embedded verbatim as text
declare module "*.txt" {
    const str: string;
    export default str;
}
