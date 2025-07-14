import os
from datetime import date, datetime
from app import create_app
from app.models import School, Worker, User, Role, CategoryEnum, Student
from app.extensions import db
from werkzeug.security import generate_password_hash
from app.models.AttendanceRecord import AttendanceRecord

app = create_app()
with app.app_context():
    def seed_data():
        # Clear existing data (for testing)
        Worker.query.delete()
        School.query.delete()
        Role.query.delete()
        User.query.delete()
        db.session.commit()
        
        admin_password = os.getenv("ADMIN_PASSWORD", "your_secure_password")

        # Create roles
        roles = ['superuser', 'admin', 'viewer', 'tutor', 'coach', 'cleaner', 'general', 'head_tutor', 'head_coach']
        for role_name in roles:
            role = Role(name=role_name)
            db.session.add(role)
        db.session.commit()

        # Create Schools
        school1 = School(name="Woodlands Primary School", address="123 Main St")
        school2 = School(name="Dagbreek Primary School", address="456 Another St")
        db.session.add_all([school1, school2])
        db.session.commit()

        # Helper to get role id by name
        def get_role_id(role_name):
            role = Role.query.filter_by(name=role_name).first()
            return role.id if role else None

        # Create superuser assigned to first school (adjust if you want None)
        if not User.query.filter_by(username="admin").first():
            superuser_role_id = get_role_id('superuser')
            superuser = User(username="admin", role_id=superuser_role_id, school_id=school1.id)
            superuser.set_password(admin_password)
            db.session.add(superuser)
            db.session.commit()

        # Create example admin user for Site A
        admin_role_id = get_role_id('admin')
        if not User.query.filter_by(username="sitea_admin").first():
            admin_user = User(username="sitea_admin", role_id=admin_role_id, school_id=school1.id)
            admin_user.set_password("adminpass")
            db.session.add(admin_user)
            db.session.commit()

        # Create example head tutor for Site B
        head_tutor_role_id = get_role_id('head_tutor')
        if not User.query.filter_by(username="head_tutor_b").first():
            head_tutor = User(username="head_tutor_b", role_id=head_tutor_role_id, school_id=school2.id)
            head_tutor.set_password("tutorpass")
            db.session.add(head_tutor)
            db.session.commit()

        # Add Workers for Site A
        workers_site_a = [
            Worker(name="John Tutor", role_id=get_role_id("tutor"), school_id=school1.id),
            Worker(name="Mary Coach", role_id=get_role_id("coach"), school_id=school1.id),
            Worker(name="Lisa Cleaner", role_id=get_role_id("cleaner"), school_id=school1.id),
            Worker(name="Sam Worker", role_id=get_role_id("general"), school_id=school1.id)
        ]

        # Add Workers for Site B
        workers_site_b = [
            Worker(name="Alice Tutor", role_id=get_role_id("tutor"), school_id=school2.id),
            Worker(name="Bob Worker", role_id=get_role_id("general"), school_id=school2.id)
        ]

        db.session.add_all(workers_site_a + workers_site_b)
        db.session.commit()
        
        students_site_a = [
            Student(
                full_name="Thabo Mokoena",
                grade="Grade 3",
                school_id=school1.id,
                category="pr",
                physical_education=True,
                year=2025
            ),
            Student(
                full_name="Ayanda Sithole",
                grade="Grade 4",
                school_id=school1.id,
                category="ww",
                physical_education=False,
                year=2025
            ),
        ]

        # Add Students for Site B
        students_site_b = [
            Student(
                full_name="Sipho Deliwe",
                grade="Grade 5",
                school_id=school2.id,
                category="un",
                physical_education=True,
                year=2025
            )
        ]

        db.session.add_all(students_site_a + students_site_b)
        db.session.commit()
        
        students = Student.query.all()
        admin_role_id = get_role_id("admin")
        admin_user = User.query.filter_by(role_id=admin_role_id).first()
        school_id = students[0].school_id if students else 1  # default fallback

        for student in students:
            attendance = AttendanceRecord(
                student_id=student.id,
                school_id=school_id,
                date=date.today(),
                status="present",
                recorded_by=admin_user.id
            )
            db.session.add(attendance)

        db.session.commit()
        print(f"✅ Created attendance records for {len(students)} students.")
        print("✅ Seed data inserted successfully.")
    seed_data()