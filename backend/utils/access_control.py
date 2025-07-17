from app.models import School

def get_allowed_site_ids(user, requested_ids):
    """
    Returns a list of allowed site_ids based on the user's role and requested site_ids.
    """
    elevated_roles = {'admin', 'superuser', 'viewer'}

    # Check role name, not object
    if user.role.name in elevated_roles:
        return requested_ids or [school.id for school in School.query.all()]

    # If no site_ids were passed, default to user's own school
    if not requested_ids:
        return [user.school_id]

    # Prevent non-elevated users from accessing other schools
    if any(site_id != user.school_id for site_id in requested_ids):
        raise PermissionError("Access denied to one or more requested sites")

    return [user.school_id]
