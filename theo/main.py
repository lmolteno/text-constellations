import numpy as np
import os
import matplotlib.pyplot as plt
from dataclasses import dataclass
from scipy.spatial import KDTree
import math
from scipy.stats import halfnorm

canvas_x = 12
canvas_y = 6
n_points = 1000

mags = [x for x in (8 - np.exp(halfnorm.rvs(size=10000) / 1.5)) if x > -5]


@dataclass
class Point:
    x: float
    y: float
    mag: float

    def plot(self, ax):
        min_star_size = 0.5
        ax.scatter([self.x], [self.y], s=[
                   (7+min_star_size-(self.mag))*5], c='blue')


def gen_pt() -> Point:
    x, y = np.random.random(2)
    mag = np.random.choice(mags)
    return Point(x*canvas_x, y*canvas_y, mag)


#
# generate stars
# --------------
stars = [gen_pt() for _ in range(n_points)]


def plot_my_stars(stars, ax=None):
    if not ax:
        _, ax = plt.subplots()

    for s in stars:
        s.plot(ax)
    ax.set_aspect('equal')
    return ax


#
# generate L I N words
# --------------------
letters = ['L', 'I', "N"]
L = [[0, 1], [0, 0], [1, 0]]
I = [[0, 1], [0, 0]]
N = [[0, 0], [0, 1], [1, 0], [1, 1]]
U = [[0, 1], [0, 0], [1, 0], [1, 1]]
S = [[1, 1], [0, 0.7], [1, 0.3], [0.5, 0], [0, 0.1]]

def get_angle_from_x_axis(vector):
    """Calculates the angle between a vector and the x-axis.
    
    Args:
        vector (tuple): The components of the vector.
    
    Returns:
        float: The angle in degrees.
    """
    x, y = vector
    angle_rad = math.atan2(y, x)
    angle_deg = math.degrees(angle_rad)
    return angle_deg

def plot_letter(letter, ax, offset_x=0, offset_y=0):
    x, y = np.array(letter)[:, 0], np.array(letter)[:, 1]
    ax.plot(x+offset_x, y+offset_y)

def plot_letter_angle(letter, ax, start_point, direction):
    fig, ax = plt.subplots()
    df= convert_letter_to_sky(letter , start_point, direction)
    x, y = np.array(df).T
    ax.plot(x,y)
    return ax

def convert_letter_to_sky(letter, start_point, direction):
    return [convert_letter_node_to_sky(i,start_point,direction) for i in letter]

def convert_letter_node_to_sky(letter_pt, start_point, direction):
    rotated_pt   =rotate_point(letter_pt, get_angle_from_x_axis(direction))
    moved_pt = [rotated_pt[0] + start_point[0], rotated_pt[1]+start_point[1]]
    return moved_pt


ax = plot_my_stars(stars)
floor = 1
plot_letter(L, ax, offset_y=floor, offset_x=0.5)
plot_letter(I, ax, offset_y=floor, offset_x=2.5)
plot_letter(N, ax, offset_y=floor, offset_x=3.5)

def calc_distance(p1, p2):
    return np.linalg.norm([p1.x - p2.x, p1.y-p2.y])

def rotate_point(point, angle, center_point=(0, 0)):
    """Rotates a point around a given center point.
    
    Args:
        point (tuple): The coordinates of the point to be rotated.
        angle (float): The angle of rotation in degrees.
        center_point (tuple, optional): The coordinates of the center point. Defaults to (0, 0).
    
    Returns:
        tuple: The coordinates of the rotated point.
    """
    if isinstance(point, Point):
        x, y = point.x, point.y
    else:
        x, y = point
    cx, cy = center_point
    angle_rad = np.deg2rad(angle)
    rotated_x = (x - cx) * np.cos(angle_rad) - (y - cy) * np.sin(angle_rad) + cx
    rotated_y = (x - cx) * np.sin(angle_rad) + (y - cy) * np.cos(angle_rad) + cy
    return rotated_x, rotated_y

def plot_letter_smart(letter, canvas, lookup, start_point, direction, debug=False):
    direction = direction / np.linalg.norm(direction)
    start_x, start_y = start_point

   

    degrees_to_check = [12, 0, -12]
    directions = [rotate_point(direction, angle) for angle in degrees_to_check]
    start_points = [[start_x + d[0] * space_between_letters, start_y + d[1] * space_between_letters] \
                    for  d in directions]

    def get_best_constellation_in(cur_direction, cur_start_point):
        if debug:
            # plot ideal
            ax = plot_my_stars(canvas)
            ax.plot(start_x, start_y, marker='x', c='r')
            plot_letter_angle(letter, ax, cur_start_point, cur_direction)

            # plot circles around ideal points
            for node in convert_letter_to_sky(letter, cur_start_point, cur_direction):
                x,y=node
                circle = plt.Circle((x, y), okay_radius, alpha=0.2)
                ax.add_patch(circle)

        chosen_stars = []
        chosen_stars_distances = []

        # find the brightest star in the circle
        for x,y in convert_letter_to_sky(letter, cur_start_point, cur_direction):
            query_result = lookup.query_ball_point([x, y], okay_radius)

            if len(query_result)==0: # take the closest star as the only option
                _, nearest_point = lookup.query([x, y])
                query_result=[nearest_point]

            # find all the distances from that point
            near_stars = [canvas[i] for i in query_result]
            magnitudes = [star.mag for star in near_stars]
            distances = [calc_distance(Point(x,y,0), star) for star in near_stars]
            chosen_star_idx=np.argmax(magnitudes)

            # take the maximum magnitude
            chosen_star = canvas[query_result[chosen_star_idx]]
            distance = distances[chosen_star_idx]
            chosen_stars.append(chosen_star)
            chosen_stars_distances.append(distance)

            if debug: # plot brightest star within radius
                ax.plot(chosen_star.x, chosen_star.y, c='r', marker='o')
        return chosen_stars, chosen_stars_distances
    
    def evaluate_constellation(constellation):
        """returns a badness score for the constellation (sum of radius*magnitudes)"""
        stars, distances = constellation
        magnitudes = [s.mag for s in stars]
        return np.sum(np.multiply(distances, magnitudes))

    constelation_options=[get_best_constellation_in(d,spt) for d, spt in zip(directions, start_points)]
    badness_metric = [evaluate_constellation(c) for c in constelation_options]
    
    # select the constelation and direction corresponding to the best constellation
    choice = np.argmin(badness_metric)
    if debug:
        print(f"chose the {choice} index option (angle {degrees_to_check[choice]})")
    best_constellation, _ = constelation_options[choice]
    direction = directions[choice]
    start_point = start_points[choice]

    best_constellation = np.array([[p.x, p.y] for p in best_constellation])
    x, y = best_constellation.T
    if debug:
        # plot the brightest setup of lines
        ax.plot(x,y)

    # find the direction to pass to the next letter, this is the transformed max(x), min(y) point
    letter_x, letter_y = np.array(letter).T
    letter_coords_end = [max(letter_x), min(letter_y)]
    final_pt = convert_letter_node_to_sky(letter_coords_end, start_point, direction)
    return final_pt, direction, best_constellation


#
# GLOBAL vars
space_between_letters = 0.5
debug = True
okay_radius = 0.3

stars = [gen_pt() for _ in range(n_points)]
canvas=stars
lookup = KDTree([[p.x, p.y] for p in stars])
start_point = [0, 2.5]  # pretend bottom left of the previous letter
direction = [1, 0]         # make sure this is magnitude 1

my_bright_letters = []
next_start_point, direction, brightest_constelation = plot_letter_smart(
    L, stars, lookup, start_point=start_point, direction=direction, debug=debug)
my_bright_letters.append(brightest_constelation)

next_start_point, direction, brightest_constelation = plot_letter_smart(
    I, stars, lookup, next_start_point, direction, debug=debug)
my_bright_letters.append(brightest_constelation)

next_start_point, direction, brightest_constelation = plot_letter_smart(
    N, stars, lookup, next_start_point, direction, debug=debug)
my_bright_letters.append(brightest_constelation)

next_start_point, direction, brightest_constelation = plot_letter_smart(
    U, stars, lookup, next_start_point, direction, debug=debug)
my_bright_letters.append(brightest_constelation)

next_start_point, direction, brightest_constelation = plot_letter_smart(
    S, stars, lookup, next_start_point, direction, debug=debug)
my_bright_letters.append(brightest_constelation)


# plot the brightest sequence of letters
fig, ax = plt.subplots()
ax = plot_my_stars(stars, ax=ax)
for constelation in my_bright_letters:
    x, y = constelation.T
    ax.plot(x, y, c='r')

plt.show()
