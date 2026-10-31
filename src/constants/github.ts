export const GITHUB_OWNER = 'super-tiny';
export const GITHUB_REPO = 'audionote';

export const githubUrls = {
  repository: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`,
  issues: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues`,
  newIssue: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues/new`,
  newFeature: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues/new?labels=enhancement&title=%5BFeature%5D+`,
  contributing: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}#contributing`,
} as const;
