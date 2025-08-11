from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'user'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    faculty_id = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(200))  # plaintext for now (you wanted no hashing)
    is_admin = db.Column(db.Boolean, default=False)

    def __repr__(self):
        return f"<User {self.faculty_id}>"

class Lab(db.Model):
    __tablename__ = 'lab'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)

    def __repr__(self):
        return f"<Lab {self.name}>"

class Timetable(db.Model):
    __tablename__ = 'timetable'
    id = db.Column(db.Integer, primary_key=True)
    lab_id = db.Column(db.Integer, db.ForeignKey('lab.id'), nullable=False)
    day = db.Column(db.String(10))  # Monday..Sunday
    period = db.Column(db.Integer)  # 1..8
    status = db.Column(db.String(10))  # 'Free' or 'Regular'
    class_info = db.Column(db.String(200), nullable=True)

    lab = db.relationship('Lab', backref='template_slots')

    def __repr__(self):
        return f"<Timetable lab={self.lab_id} {self.day}@{self.period}>"

class Booking(db.Model):
    __tablename__ = 'booking'
    id = db.Column(db.Integer, primary_key=True)
    timetable_id = db.Column(db.Integer, db.ForeignKey('timetable.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    faculty_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    class_info = db.Column(db.String(200), nullable=True)

    faculty = db.relationship('User', backref='bookings')
    timetable = db.relationship('Timetable', backref='bookings')

    __table_args__ = (db.UniqueConstraint('timetable_id', 'date', name='uix_timetable_date'),)

    def __repr__(self):
        return f"<Booking slot={self.timetable_id} date={self.date}>"

class WeekendDefault(db.Model):
    __tablename__ = 'weekend_default'
    id = db.Column(db.Integer, primary_key=True)
    lab_id = db.Column(db.Integer, db.ForeignKey('lab.id'), nullable=True)  # NULL for global default
    day = db.Column(db.String(10), nullable=False)  # 'Saturday' or 'Sunday'
    custom_text = db.Column(db.String(200), nullable=True)

    def __repr__(self):
        return f"<WeekendDefault lab={self.lab_id} day={self.day}>"

class WeekendOverride(db.Model):
    __tablename__ = 'weekend_override'
    id = db.Column(db.Integer, primary_key=True)
    lab_id = db.Column(db.Integer, db.ForeignKey('lab.id'), nullable=False)
    day = db.Column(db.String(10), nullable=False)  # 'Saturday' or 'Sunday'
    target_date = db.Column(db.Date, nullable=False)
    override_type = db.Column(db.String(20), nullable=False)  # e.g. 'follow'
    source_day = db.Column(db.String(10), nullable=True)  # e.g. 'Wednesday'
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

    def __repr__(self):
        return f"<WeekendOverride lab={self.lab_id} day={self.day} target={self.target_date}>"

class Notification(db.Model):
    __tablename__ = 'notification'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=True)
    message = db.Column(db.Text, nullable=True)
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

    def __repr__(self):
        return f"<Notification {self.id} active={self.active}>"
