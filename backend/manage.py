from app import create_app
from app.extensions import db
from flask_migrate import MigrateCommand
from flask.cli import with_appcontext
from flask_migrate import upgrade, migrate, init, revision
import click

app = create_app()

@app.cli.command("db-init")
@with_appcontext
def db_init():
    """Initializes migrations directory"""
    init()

@app.cli.command("db-migrate")
@with_appcontext
def db_migrate():
    """Creates a new migration"""
    migrate()

@app.cli.command("db-upgrade")
@with_appcontext
def db_upgrade():
    """Applies migrations"""
    upgrade()
