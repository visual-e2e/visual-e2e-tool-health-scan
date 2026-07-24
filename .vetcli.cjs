module.exports = {
  allowBranch: ["master", "main"],
  bumpFiles: ["package.json", "package-lock.json"],
  tagPrefix: "v",
  releasePrefix: "release-v",
  changelog: false,
  hooks: {
    prepublish: "npm run pack",
  },
  assets: ["dist/*.vettool.zip"],
};
