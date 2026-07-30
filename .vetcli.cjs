module.exports = {
  allowBranch: ["master", "main"],
  bumpFiles: ["package.json", "package-lock.json", "tool.json"],
  tagPrefix: "v",
  releasePrefix: "release-v",
  changelog: false,
  hooks: {
    prepublish: "npm run pack",
  },
  assets: ["dist/*.vettool.zip"],
};
