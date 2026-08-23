import type { BlameService } from "./git/blameService";
import type { RepoResolver } from "./git/repository";

export interface Services {
  resolver: RepoResolver;
  blame: BlameService;
}
