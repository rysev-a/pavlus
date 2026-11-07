// Directory (api): the professions and the skill tree, in one call.

import { httpEffector, oneOf } from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import { DirectoryService } from "../db/services/directory-service.ts";

export class DirectoryAPI {
  "dir.list"(): Effect[] {
    return [DirectoryService.all()];
  }

  "dir.all.onSuccess"(message: Message): Effect[] {
    return [httpEffector.makeResponse(200, oneOf(message))];
  }

  "dir.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "internal error" })];
  }
}
