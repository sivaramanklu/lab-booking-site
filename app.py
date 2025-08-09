import os
from datetime import date, timedelta, datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from models import db, User, Lab, Timetable, Booking, WeekendDefault, WeekendOverride
from flask_cors import CORS


# ---------- App & DB setup ----------
app = Flask(__name__)
# allow only GitHub Pages and local dev
CORS(app, resources={r"/api/*": {"origins": ["https://sivaramanklu.github.io", "http://localhost:8000"]}}, supports_credentials=True)


# Use DATABASE_URL environment variable on Render; fallback to sqlite for local dev
DATABASE_URL = os.environ.get('DATABASE_URL', 'sqlite:///database.db')
# Some PAAS (older) provide postgres:// — SQLAlchemy prefers postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

# Configure allowed origins for CORS:
# Option A (recommended): set FRONTEND_ORIGINS env var as comma-separated list, e.g.
# FRONTEND_ORIGINS="https://sivaramanklu.github.io,http://localhost:8000"
raw_origins = os.environ.get('FRONTEND_ORIGINS', 'http://localhost:8000,https://sivaramanklu.github.io')
origins = [o.strip() for o in raw_origins.split(',') if o.strip()]
# For quick dev you can use CORS(app) but in production prefer listing explicit origins
CORS(app, resources={r"/api/*": {"origins": origins}}, supports_credentials=True)

# ---------- Utilities ----------
def compute_week_dates():
    """Return dict: day_name -> date for upcoming week (Monday..Sunday)
       The 'upcoming' means the next occurrence on/after today.
    """
    today = date.today()
    days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
    mapping = {}
    for i, d in enumerate(days):
        # weekday(): Monday=0
        days_until = (i - today.weekday()) % 7
        mapping[d] = today + timedelta(days=days_until)
    return mapping

def is_requester_admin_from_args_or_json():
    requester = None
    if request.method == 'GET':
        requester = request.args.get('requester')
    else:
        data = request.get_json(silent=True) or {}
        requester = data.get('requester_faculty_id') or data.get('requester')
    if not requester:
        return False, "Missing requester faculty id"
    user = User.query.filter_by(faculty_id=requester).first()
    if not user:
        return False, "Requester not found"
    if not user.is_admin:
        return False, "Requester is not admin"
    return True, user

# ---------- Create tables and default admin ----------
def create_tables_and_admin():
    with app.app_context():
        db.create_all()
        if not User.query.filter_by(faculty_id='admin').first():
            admin = User(name='Admin', faculty_id='admin', password='admin', is_admin=True)
            db.session.add(admin)
            db.session.commit()
            print("Admin user created: admin / admin (change password ASAP)")

def fill_initial_timetable():
    with app.app_context():
        days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
        if Lab.query.count() == 0:
            for i in range(1, 11):
                db.session.add(Lab(name=f'Lab {i}'))
            db.session.commit()
        periods = range(1, 9)
        labs = Lab.query.all()
        for lab in labs:
            for day in days:
                for p in periods:
                    if not Timetable.query.filter_by(lab_id=lab.id, day=day, period=p).first():
                        slot = Timetable(lab_id=lab.id, day=day, period=p, status='Free')
                        db.session.add(slot)
        db.session.commit()

# ---------- API: Auth (simple), Labs, Timetable, Booking ----------

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    faculty_id = data.get('faculty_id')
    password = data.get('password')
    if not faculty_id or not password:
        return jsonify({'success': False, 'message': 'Missing credentials'}), 400
    user = User.query.filter_by(faculty_id=faculty_id, password=password).first()
    if user:
        return jsonify({
            'success': True,
            'user_id': user.id,
            'faculty_id': user.faculty_id,
            'name': user.name,
            'is_admin': user.is_admin
        })
    return jsonify({'success': False, 'message': 'Invalid credentials'}), 401

# labs
@app.route('/api/labs', methods=['GET'])
def get_labs():
    labs = Lab.query.all()
    return jsonify([{'id': l.id, 'name': l.name} for l in labs])

@app.route('/api/labs', methods=['POST'])
def create_lab():
    data = request.get_json() or {}
    ok, resp = is_requester_admin_from_args_or_json()
    if not ok: return jsonify({'success': False, 'message': resp}), 403
    name = data.get('name')
    if not name: return jsonify({'success': False, 'message': 'Missing name'}), 400
    lab = Lab(name=name)
    db.session.add(lab)
    db.session.commit()
    # create template slots
    days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
    for day in days:
        for p in range(1,9):
            t = Timetable(lab_id=lab.id, day=day, period=p, status='Free')
            db.session.add(t)
    db.session.commit()
    return jsonify({'success': True, 'id': lab.id, 'name': lab.name})

@app.route('/api/labs/<int:lab_id>', methods=['PUT'])
def update_lab(lab_id):
    data = request.get_json() or {}
    ok, resp = is_requester_admin_from_args_or_json()
    if not ok: return jsonify({'success': False, 'message': resp}), 403
    name = data.get('name')
    if not name: return jsonify({'success': False, 'message': 'Missing name'}), 400
    lab = Lab.query.get(lab_id)
    if not lab: return jsonify({'success': False, 'message': 'Lab not found'}), 404
    lab.name = name
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/labs/<int:lab_id>', methods=['DELETE'])
def delete_lab(lab_id):
    data = request.get_json() or {}
    ok, resp = is_requester_admin_from_args_or_json()
    if not ok: return jsonify({'success': False, 'message': resp}), 403
    lab = Lab.query.get(lab_id)
    if not lab: return jsonify({'success': False, 'message': 'Lab not found'}), 404
    # delete related timetables and bookings and defaults/overrides
    timetable_ids = [t.id for t in Timetable.query.filter_by(lab_id=lab_id).all()]
    if timetable_ids:
        Booking.query.filter(Booking.timetable_id.in_(timetable_ids)).delete(synchronize_session=False)
    Timetable.query.filter_by(lab_id=lab_id).delete(synchronize_session=False)
    WeekendDefault.query.filter_by(lab_id=lab_id).delete(synchronize_session=False)
    WeekendOverride.query.filter_by(lab_id=lab_id).delete(synchronize_session=False)
    db.session.delete(lab)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/timetable/<int:lab_id>', methods=['GET'])
def get_timetable(lab_id):
    # auto-release past bookings
    today = date.today()
    Booking.query.filter(Booking.date < today).delete(synchronize_session=False)
    db.session.commit()

    week_dates = compute_week_dates()
    template_slots = Timetable.query.filter_by(lab_id=lab_id).all()
    result = []
    for slot in template_slots:
        slot_date = week_dates.get(slot.day)
        booking = Booking.query.filter_by(timetable_id=slot.id, date=slot_date).first()
        if booking:
            status = 'Booked'
            faculty_id = booking.faculty_id
            faculty_name = booking.faculty.name if booking.faculty else None
            class_info = booking.class_info
        else:
            # weekend special handling (overrides and defaults)
            if slot.day in ['Saturday','Sunday']:
                override = WeekendOverride.query.filter_by(lab_id=lab_id, day=slot.day, target_date=slot_date).first()
                if override and override.override_type == 'follow' and override.source_day:
                    source_slot = Timetable.query.filter_by(lab_id=lab_id, day=override.source_day, period=slot.period).first()
                    if source_slot and source_slot.status == 'Regular':
                        status = 'Regular'
                        class_info = source_slot.class_info
                    else:
                        status = 'Free'
                        class_info = None
                else:
                    # lab-specific default, else global default, else template slot status
                    wd = WeekendDefault.query.filter_by(lab_id=lab_id, day=slot.day).first()
                    if not wd:
                        wd = WeekendDefault.query.filter_by(lab_id=None, day=slot.day).first()
                    if wd and wd.custom_text:
                        status = 'Regular'
                        class_info = wd.custom_text
                    else:
                        if slot.status == 'Regular':
                            status = 'Regular'
                            class_info = slot.class_info
                        else:
                            status = 'Free'
                            class_info = None
                faculty_id = None
                faculty_name = None
            else:
                if slot.status == 'Regular':
                    status = 'Regular'
                    class_info = slot.class_info
                else:
                    status = 'Free'
                    class_info = None
                faculty_id = None
                faculty_name = None

        result.append({
            'id': slot.id,
            'lab_id': slot.lab_id,
            'day': slot.day,
            'period': slot.period,
            'status': status,
            'class_info': class_info,
            'faculty_id': faculty_id,
            'faculty_name': faculty_name,
            'date': slot_date.isoformat()
        })
    return jsonify(result)

# Book a slot for a date
@app.route('/api/book', methods=['POST'])
def book_slot():
    data = request.json or {}
    try:
        timetable_id = int(data.get('id'))
    except Exception:
        return jsonify({'success': False, 'message': 'Invalid slot id'}), 400
    date_str = data.get('date')
    if not date_str:
        return jsonify({'success': False, 'message': 'Missing date'}), 400
    try:
        req_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except Exception:
        return jsonify({'success': False, 'message': 'Invalid date format, use YYYY-MM-DD'}), 400
    today = date.today()
    if req_date < today:
        return jsonify({'success': False, 'message': 'Cannot book past date'}), 400
    slot = Timetable.query.get(timetable_id)
    if not slot:
        return jsonify({'success': False, 'message': 'Slot not found'}), 404

    # Do not allow booking of Regular template weekday slots
    if slot.day not in ['Saturday','Sunday'] and slot.status == 'Regular':
        return jsonify({'success': False, 'message': 'This period is marked Regular by admin'}), 400

    # handle weekend patterns: if weekend is blocked by default/override as Regular, disallow booking
    if slot.day in ['Saturday','Sunday']:
        week_dates = compute_week_dates()
        slot_date = week_dates.get(slot.day)
        override = WeekendOverride.query.filter_by(lab_id=slot.lab_id, day=slot.day, target_date=slot_date).first()
        if override and override.override_type == 'follow' and override.source_day:
            source_slot = Timetable.query.filter_by(lab_id=slot.lab_id, day=override.source_day, period=slot.period).first()
            if source_slot and source_slot.status == 'Regular':
                return jsonify({'success': False, 'message': 'This period is marked Regular by admin (override)'}), 400
        else:
            wd = WeekendDefault.query.filter_by(lab_id=slot.lab_id, day=slot.day).first()
            if not wd:
                wd = WeekendDefault.query.filter_by(lab_id=None, day=slot.day).first()
            if wd and wd.custom_text:
                return jsonify({'success': False, 'message': 'This weekend period is blocked by default'}), 400

    existing = Booking.query.filter_by(timetable_id=timetable_id, date=req_date).first()
    if existing:
        return jsonify({'success': False, 'message': 'Slot already booked for that date'}), 400

    booking = Booking(
        timetable_id=timetable_id,
        date=req_date,
        faculty_id=data.get('faculty_id'),
        class_info=data.get('class_info')
    )
    db.session.add(booking)
    db.session.commit()
    return jsonify({'success': True})

# Release
@app.route('/api/release', methods=['POST'])
def release_slot():
    data = request.json or {}
    try:
        timetable_id = int(data.get('id'))
    except Exception:
        return jsonify({'success': False, 'message': 'Invalid slot id'}), 400
    date_str = data.get('date')
    if not date_str: return jsonify({'success': False, 'message': 'Missing date'}), 400
    try:
        req_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except Exception:
        return jsonify({'success': False, 'message': 'Invalid date format'}), 400
    booking = Booking.query.filter_by(timetable_id=timetable_id, date=req_date).first()
    if not booking:
        return jsonify({'success': False, 'message': 'No booking found for that slot/date'}), 404
    if data.get('is_admin') or str(data.get('faculty_id')) == str(booking.faculty_id):
        db.session.delete(booking)
        db.session.commit()
        return jsonify({'success': True})
    return jsonify({'success': False, 'message': 'Not authorized to release'}), 403

# Admin block/unblock a template slot (right-click)
@app.route('/api/block', methods=['POST'])
def block_slot():
    data = request.json or {}
    slot_id = data.get('slot_id')
    new_status = data.get('status')
    class_info = data.get('class_info') if new_status == 'Regular' else None
    slot = Timetable.query.get(slot_id)
    if not slot:
        return jsonify({'success': False, 'message': 'Slot not found'}), 404
    if new_status not in ['Free', 'Regular']:
        return jsonify({'success': False, 'message': 'Invalid status'}), 400
    slot.status = new_status
    slot.class_info = class_info
    # when a slot is marked Regular, remove future bookings for that slot
    if new_status == 'Regular':
        today = date.today()
        Booking.query.filter(Booking.timetable_id == slot.id, Booking.date >= today).delete(synchronize_session=False)
    db.session.commit()
    return jsonify({'success': True})

# ---------------- Admin user endpoints ----------------
@app.route('/api/users', methods=['GET'])
def list_users():
    ok, resp = is_requester_admin_from_args_or_json()
    if not ok: return jsonify({'success': False, 'message': resp}), 403
    users = User.query.all()
    out = [{'id': u.id, 'name': u.name, 'faculty_id': u.faculty_id, 'is_admin': u.is_admin} for u in users]
    return jsonify(out)

@app.route('/api/users', methods=['POST'])
def create_user():
    data = request.json or {}
    ok, resp = is_requester_admin_from_args_or_json()
    if not ok: return jsonify({'success': False, 'message': resp}), 403
    name = data.get('name'); faculty_id = data.get('faculty_id'); password = data.get('password')
    is_admin_flag = bool(data.get('is_admin'))
    if not name or not faculty_id or not password:
        return jsonify({'success': False, 'message': 'name, faculty_id and password required'}), 400
    if User.query.filter_by(faculty_id=faculty_id).first():
        return jsonify({'success': False, 'message': 'faculty_id already exists'}), 400
    new_user = User(name=name, faculty_id=faculty_id, password=password, is_admin=is_admin_flag)
    db.session.add(new_user)
    db.session.commit()
    return jsonify({'success': True, 'id': new_user.id})

@app.route('/api/users/<int:user_id>', methods=['PUT'])
def update_user(user_id):
    data = request.json or {}
    ok, resp = is_requester_admin_from_args_or_json()
    if not ok: return jsonify({'success': False, 'message': resp}), 403
    u = User.query.get(user_id)
    if not u: return jsonify({'success': False, 'message': 'User not found'}), 404
    if 'name' in data: u.name = data.get('name')
    if 'password' in data and data.get('password'): u.password = data.get('password')
    if 'is_admin' in data: u.is_admin = bool(data.get('is_admin'))
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    data = request.json or {}
    ok, resp = is_requester_admin_from_args_or_json()
    if not ok: return jsonify({'success': False, 'message': resp}), 403
    u = User.query.get(user_id)
    if not u: return jsonify({'success': False, 'message': 'User not found'}), 404
    # prevent deleting last admin or self-delete easily
    requester = data.get('requester_faculty_id')
    req_user = User.query.filter_by(faculty_id=requester).first() if requester else None
    if req_user and req_user.faculty_id == u.faculty_id:
        return jsonify({'success': False, 'message': 'Admin cannot delete themselves'}), 400
    if u.is_admin:
        admins_count = User.query.filter_by(is_admin=True).count()
        if admins_count <= 1:
            return jsonify({'success': False, 'message': 'Cannot delete the last admin'}), 400
    db.session.delete(u)
    db.session.commit()
    return jsonify({'success': True})

# ---------------- Weekend default & override endpoints ----------------

@app.route('/api/weekend/<int:lab_id>', methods=['GET'])
def get_weekend_config(lab_id):
    week_dates = compute_week_dates()
    sat_date = week_dates['Saturday']
    sun_date = week_dates['Sunday']
    sat_override = WeekendOverride.query.filter_by(lab_id=lab_id, day='Saturday', target_date=sat_date).first()
    sun_override = WeekendOverride.query.filter_by(lab_id=lab_id, day='Sunday', target_date=sun_date).first()
    sat_default = WeekendDefault.query.filter_by(lab_id=lab_id, day='Saturday').first()
    if not sat_default:
        sat_default = WeekendDefault.query.filter_by(lab_id=None, day='Saturday').first()
    sun_default = WeekendDefault.query.filter_by(lab_id=lab_id, day='Sunday').first()
    if not sun_default:
        sun_default = WeekendDefault.query.filter_by(lab_id=None, day='Sunday').first()
    return jsonify({
        'saturday': {
            'default_text': sat_default.custom_text if sat_default else None,
            'override': {
                'exists': bool(sat_override),
                'source_day': sat_override.source_day if sat_override else None,
                'target_date': sat_override.target_date.isoformat() if sat_override else None
            }
        },
        'sunday': {
            'default_text': sun_default.custom_text if sun_default else None,
            'override': {
                'exists': bool(sun_override),
                'source_day': sun_override.source_day if sun_override else None,
                'target_date': sun_override.target_date.isoformat() if sun_override else None
            }
        }
    })

@app.route('/api/weekend/global', methods=['GET'])
def get_weekend_global():
    sat_default = WeekendDefault.query.filter_by(lab_id=None, day='Saturday').first()
    sun_default = WeekendDefault.query.filter_by(lab_id=None, day='Sunday').first()
    return jsonify({
        'saturday': sat_default.custom_text if sat_default else None,
        'sunday': sun_default.custom_text if sun_default else None
    })

@app.route('/api/weekend/default', methods=['POST'])
def set_weekend_default():
    data = request.json or {}
    ok, resp = is_requester_admin_from_args_or_json()
    if not ok: return jsonify({'success': False, 'message': resp}), 403
    lab_id = data.get('lab_id')  # can be 'global' or integer (or None)
    day = data.get('day')
    custom_text = data.get('custom_text')
    if day not in ['Saturday','Sunday']:
        return jsonify({'success': False, 'message': 'Invalid day'}), 400
    if lab_id == 'global' or lab_id is None:
        lab_val = None
    else:
        try:
            lab_val = int(lab_id)
        except Exception:
            return jsonify({'success': False, 'message': 'Invalid lab_id'}), 400
        if not Lab.query.get(lab_val):
            return jsonify({'success': False, 'message': 'Lab not found'}), 404
    wd = WeekendDefault.query.filter_by(lab_id=lab_val, day=day).first()
    if not wd:
        wd = WeekendDefault(lab_id=lab_val, day=day, custom_text=custom_text)
        db.session.add(wd)
    else:
        wd.custom_text = custom_text
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/weekend/override', methods=['POST'])
def set_weekend_override():
    data = request.json or {}
    ok, resp = is_requester_admin_from_args_or_json()
    if not ok: return jsonify({'success': False, 'message': resp}), 403
    admin_user = resp
    lab_id = data.get('lab_id')
    day = data.get('day')  # 'Saturday' or 'Sunday'
    source_day = data.get('source_day')  # e.g. 'Wednesday' or None to clear
    if day not in ['Saturday','Sunday']:
        return jsonify({'success': False, 'message': 'Invalid day'}), 400
    try:
        lab_val = int(lab_id)
    except Exception:
        return jsonify({'success': False, 'message': 'Invalid lab_id'}), 400
    lab = Lab.query.get(lab_val)
    if not lab:
        return jsonify({'success': False, 'message': 'Lab not found'}), 404
    week_dates = compute_week_dates()
    target_date = week_dates.get(day)
    if not source_day:
        # clear override
        WeekendOverride.query.filter_by(lab_id=lab_val, day=day, target_date=target_date).delete(synchronize_session=False)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Override cleared'})
    if source_day not in ['Monday','Tuesday','Wednesday','Thursday','Friday']:
        return jsonify({'success': False, 'message': 'Invalid source day'}), 400
    ov = WeekendOverride.query.filter_by(lab_id=lab_val, day=day, target_date=target_date).first()
    if not ov:
        ov = WeekendOverride(
            lab_id=lab_val, day=day, target_date=target_date,
            override_type='follow', source_day=source_day, created_by=admin_user.id if admin_user else None
        )
        db.session.add(ov)
    else:
        ov.override_type = 'follow'; ov.source_day = source_day; ov.created_by = admin_user.id if admin_user else None
    db.session.commit()
    return jsonify({'success': True})

# ---------- Start-up: Create tables & sample data ----------
with app.app_context():
    create_tables_and_admin()
    fill_initial_timetable()
    # remove old bookings (past)
    try:
        Booking.query.filter(Booking.date < date.today()).delete(synchronize_session=False)
        db.session.commit()
    except Exception:
        db.session.rollback()

# ---------- Run ----------
if __name__ == '__main__':
    # Local dev server
    app.run(host='0.0.0.0', debug=True)
