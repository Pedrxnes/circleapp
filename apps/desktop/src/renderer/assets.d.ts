// Vite resolves image imports to the emitted asset's URL.
declare module "*.png" {
  const url: string;
  export default url;
}
