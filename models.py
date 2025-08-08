from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    faculty_id = db.Column(db.String(50), unique=True)
    password = db.Column(db.String(200))  # NOTE: store hashed password in production
    is_admin = db.Column(db.Boolean, default=False)

class Lab(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50))

class Timetable(db.Model):
    """Template timetable for each lab (repeated every week)."""
    id = db.Column(db.Integer, primary_key=True)
    lab_id = db.Column(db.Integer, db.ForeignKey('lab.id'))
    day = db.Column(db.String(10))  # Monday..Sunday
    period = db.Column(db.Integer)  # 1..8
    status = db.Column(db.String(10))  # 'Free' or 'Regular'
    class_info = db.Column(db.String(200), nullable=True)  # admin text if Regular

class Booking(db.Model):
    """Actual booking for a particular date."""
    id = db.Column(db.Integer, primary_key=True)
    timetable_id = db.Column(db.Integer, db.ForeignKey('timetable.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    faculty_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    class_info = db.Column(db.String(200), nullable=True)
    faculty = db.relationship('User')
    timetable = db.relationship('Timetable', backref='bookings')

    __table_args__ = (db.UniqueConstraint('timetable_id', 'date', name='uix_timetable_date'),)

class WeekendDefault(db.Model):
    """
    Default weekend block text per lab and per day.
    If lab_id is NULL => global default used for all labs (unless lab-specific exists).
    """
    id = db.Column(db.Integer, primary_key=True)
    lab_id = db.Column(db.Integer, db.ForeignKey('lab.id'), nullable=True)  # NULL => global
    day = db.Column(db.String(10), nullable=False)  # 'Saturday' or 'Sunday'
    custom_text = db.Column(db.String(200), nullable=True)

class WeekendOverride(db.Model):
    """
    Temporary override for an upcoming weekend date:
    - lab_id, day ('Saturday'/'Sunday'), target_date (actual date), override_type ('follow'), and source_day
    """
    id = db.Column(db.Integer, primary_key=True)
    lab_id = db.Column(db.Integer, db.ForeignKey('lab.id'), nullable=False)
    day = db.Column(db.String(10), nullable=False)
    target_date = db.Column(db.Date, nullable=False)
    override_type = db.Column(db.String(20), nullable=False)  # 'follow'
    source_day = db.Column(db.String(10), nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
