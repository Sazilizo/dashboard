from app.models import School

def get_allowed_site_ids(user, requested_ids=None):
    """
    Returns a list of allowed site_ids based on the user's role and requested site_ids.
    - Elevated roles (superuser, admin, viewer, maintenance_user, hr) can access all or any requested sites.
    - Head-level roles (e.g. head_tutor, head_coach) are restricted to their assigned school.
    - Raises PermissionError for invalid access.
    """
    if not user:
        raise ValueError("No user provided")

    role_name = user.role.name
    elevated_roles = {"superuser", "admin", "viewer", "maintenance_user", "hr"}

    # Normalize requested_ids to a list
    if isinstance(requested_ids, int):
        requested_ids = [requested_ids]
    elif requested_ids is None:
        requested_ids = []

    if role_name in elevated_roles:
        # Full access to all schools if none explicitly requested
        return requested_ids or [school.id for school in School.query.all()]

    # Head-level users limited to their assigned school
    if not requested_ids:
        return [user.school_id]

    if any(int(site_id) != user.school_id for site_id in requested_ids):
        raise PermissionError("Access denied to one or more requested sites")

    return [user.school_id]
