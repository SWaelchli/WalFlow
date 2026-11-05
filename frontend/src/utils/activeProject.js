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
