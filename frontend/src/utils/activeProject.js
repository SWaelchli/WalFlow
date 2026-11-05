// The active project as the app keeps it, from a GET /api/projects/{id} response
export function activeProjectFromDetail(detail) {
  return {
    id: detail.id,
    title: detail.title,
    description: detail.description,
    allowed_pipe_classes: detail.allowed_pipe_classes,
    allow_custom_pipes: detail.allow_custom_pipes !== false,
    members: detail.members,
  };
}

// Why a new pipe cannot be drawn yet: the project's pipe rules are not known. Null when they are.
export function pipeConnectionBlockMessage({ projectRulesLoaded, projectDetailsFailed, currentUser }) {
  if (projectRulesLoaded) return null;
  if (!currentUser) return "Sign in to load this project's settings before connecting pipes.";
  if (projectDetailsFailed) return "Could not load this project's settings. Use Retry in Settings › Project before connecting pipes.";
  return "This project's settings are still loading. Try again in a moment.";
}
