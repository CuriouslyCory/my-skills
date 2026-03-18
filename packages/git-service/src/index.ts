import simpleGit, {
  type SimpleGit,
  type StatusResult,
  type LogResult,
  type DefaultLogFields,
  type DiffResult,
  type BranchSummary,
} from "simple-git";

export interface CloneOptions {
  depth?: number;
}

export interface FetchOptions {
  remote?: string;
  branch?: string;
  prune?: boolean;
}

export class GitService {
  private git: SimpleGit;

  constructor(repoPath: string) {
    this.git = simpleGit(repoPath);
  }

  async clone(url: string, path: string, opts?: CloneOptions): Promise<void> {
    const args: string[] = [];
    if (opts?.depth) {
      args.push("--depth", String(opts.depth));
    }
    await this.git.clone(url, path, args);
  }

  async fetch(opts?: FetchOptions): Promise<void> {
    const args: string[] = [];
    if (opts?.prune) {
      args.push("--prune");
    }
    if (opts?.remote && opts.branch) {
      await this.git.fetch(opts.remote, opts.branch, args);
    } else if (opts?.remote) {
      await this.git.fetch(opts.remote, args);
    } else {
      await this.git.fetch(args);
    }
  }

  async pull(): Promise<void> {
    await this.git.pull();
  }

  async status(): Promise<StatusResult> {
    return this.git.status();
  }

  async log(
    filePath?: string,
    maxCount?: number,
  ): Promise<LogResult<DefaultLogFields>> {
    const options: Record<string, unknown> = {};
    if (maxCount) {
      options["--max-count"] = maxCount;
    }
    if (filePath) {
      options.file = filePath;
    }
    return this.git.log(options);
  }

  async diff(
    filePath?: string,
    fromCommit?: string,
    toCommit?: string,
  ): Promise<string> {
    const args: string[] = [];
    if (fromCommit) {
      args.push(fromCommit);
    }
    if (toCommit) {
      args.push(toCommit);
    }
    if (filePath) {
      args.push("--", filePath);
    }
    return this.git.diff(args);
  }

  async commit(files: string[], message: string): Promise<string> {
    await this.git.add(files);
    const result = await this.git.commit(message);
    return result.commit;
  }

  async push(): Promise<void> {
    await this.git.push();
  }

  async branches(): Promise<BranchSummary> {
    return this.git.branch();
  }

  async checkout(ref: string): Promise<void> {
    await this.git.checkout(ref);
  }

  async showFileAtCommit(filePath: string, commitHash: string): Promise<string> {
    return this.git.show([`${commitHash}:${filePath}`]);
  }
}

export type { StatusResult, LogResult, DefaultLogFields, DiffResult, BranchSummary };
