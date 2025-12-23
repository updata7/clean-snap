/**
 * Update Configuration
 * Configure update source (GitHub or Gitee)
 */

export type UpdateProvider = 'github' | 'gitee' | 'custom';

export interface UpdateConfig {
  provider: UpdateProvider;
  githubRepo?: string; // Format: "owner/repo"
  giteeRepo?: string; // Format: "owner/repo"
  customUrl?: string; // Custom update server URL
  githubToken?: string; // Optional: GitHub token for private repos or rate limiting
}

/**
 * Default update configuration
 * Modify these values to match your repository
 */
export const UPDATE_CONFIG: UpdateConfig = {
  provider: 'github', // Change to 'gitee' to use Gitee
  githubRepo: 'your-username/cleansnap-web', // Replace with your GitHub repo
  giteeRepo: 'your-username/cleansnap-web', // Replace with your Gitee repo
  // Optional: Set GITHUB_TOKEN environment variable for private repos
  githubToken: process.env.GITHUB_TOKEN,
};
