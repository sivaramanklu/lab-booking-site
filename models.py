from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    faculty_id = db.Column(db.String(50), unique=True)
    password = db.Column(db.String(200))  # plaintext as you requested (consider hashing later)
    is_admin = db.Column(db.Boolean, default=False)

class Lab(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50))

class Timetable(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    lab_id = db.Column(db.Integer, db.ForeignKey('lab.id'))
    day = db.Column(db.String(10))
    period = db.Column(db.Integer)
    status = db.Column(db.String(10))  # 'Free' or 'Regular'
    class_info = db.Column(db.String(200), nullable=True)

class Booking(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timetable_id = db.Column(db.Integer, db.ForeignKey('timetable.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    faculty_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    class_info = db.Column(db.String(200), nullable=True)
    faculty = db.relationship('User')
    timetable = db.relationship('Timetable', backref='bookings')
    __table_args__ = (db.UniqueConstraint('timetable_id', 'date', name='uix_timetable_date'),)

class WeekendDefault(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    lab_id = db.Column(db.Integer, db.ForeignKey('lab.id'), nullable=True)
    day = db.Column(db.String(10), nullable=False)
    custom_text = db.Column(db.String(200), nullable=True)

class WeekendOverride(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    lab_id = db.Column(db.Integer, db.ForeignKey('lab.id'), nullable=False)
    day = db.Column(db.String(10), nullable=False)
    target_date = db.Column(db.Date, nullable=False)
    override_type = db.Column(db.String(20), nullable=False)
    source_day = db.Column(db.String(10), nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

