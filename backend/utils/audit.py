import os
from datetime import datetime

AUDIT_LOG_FILE = os.path.join("logs", "audit.log")

def log_event(event_type, user_id=None, ip=None, description=None, level="INFO", print_to_console=False):
    """
    Logs a security or audit-related event to a file.
    
    Parameters:
        event_type (str): The type of the event (e.g., LOGIN_SUCCESS).
        user_id (int|None): The user ID, if available.
        ip (str|None): IP address, if available.
        description (str|None): Additional context.
        level (str): Log level (e.g., INFO, WARNING, ERROR).
        print_to_console (bool): Optionally print to stdout (for debugging/dev).
    """
    os.makedirs(os.path.dirname(AUDIT_LOG_FILE), exist_ok=True)

    timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    log_entry = (
        f"[{timestamp}] [{level.upper()}] EVENT: {event_type} | "
        f"USER: {user_id or 'N/A'} | IP: {ip or 'N/A'} | DESC: {description or 'N/A'}\n"
    )

    with open(AUDIT_LOG_FILE, "a") as log_file:
        log_file.write(log_entry)

    if print_to_console:
        print(log_entry.strip())
