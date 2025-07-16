
def get_allowed_site_ids(user, requested_ids):
    """
    Returns a list of allowed site_ids based on the user's role and requested site_ids.
    """
    elevated_roles = {'admin', 'superuser', 'viewer'}

    # Default to user's school
    if not requested_ids:
        return [user.school_id]

    if user.role in elevated_roles:
        return requested_ids

    # Restrict non-elevated users to their own school
    if any(site_id != user.school_id for site_id in requested_ids):
        raise PermissionError("Access denied to one or more requested sites")

    return [user.school_id]
