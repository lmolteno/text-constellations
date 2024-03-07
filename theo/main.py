import numpy as np
import os
import matplotlib.pyplot as plt
from dataclasses import dataclass
from scipy.spatial import KDTree
from scipy.stats import halfnorm

canvas_x = 12
canvas_y = 3
n_points = 200

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


def plot_letter(letter, ax, offset_x=0, offset_y=0):
    x, y = np.array(letter)[:, 0], np.array(letter)[:, 1]
    ax.plot(x+offset_x, y+offset_y)


ax = plot_my_stars(stars)
floor = 1
plot_letter(L, ax, offset_y=floor, offset_x=0.5)
plot_letter(I, ax, offset_y=floor, offset_x=2.5)
plot_letter(N, ax, offset_y=floor, offset_x=3.5)


def plot_letter_smart(letter, canvas, lookup, start_point, direction, debug=False):
    start_x, start_y = start_point

    if debug:
        # plot ideal
        ax = plot_my_stars(canvas)
        ax.plot(start_x, start_y, marker='x', c='r')
        plot_letter(letter, ax,
                    offset_x=start_x + direction[0]*space_between_letters,
                    offset_y=start_y + direction[1]*space_between_letters)

        # plot circles around ideal points
        for node in letter:
            x, y = node
            curx, cury = x + start_x + space_between_letters * \
                direction[0], y + start_y + space_between_letters*direction[1]
            circle = plt.Circle((curx, cury), okay_radius, alpha=0.2)
            ax.add_patch(circle)

    brightest_neighbours = []

    # find the brightest star in the circle
    for node in letter:
        x, y = node
        curx, cury = x + start_x + space_between_letters * \
            direction[0], y + start_y + space_between_letters*direction[1]
        query_result = lookup.query_ball_point([curx, cury], okay_radius)

        brightest_mag = 7
        brightest_mag_index = None
        if len(query_result) == 0:
            _, nearest_point = lookup.query([curx, cury])
            brightest_mag_index = nearest_point
            if debug:
                print("no stars within radius, using potentially distant star")
        else:
            for index in query_result:
                if canvas[index].mag < brightest_mag:
                    brightest_mag_index = index

        brightest_neighbour = canvas[brightest_mag_index]
        brightest_neighbours.append(brightest_neighbour)

        if debug:
            # plot brightest star within radius
            ax.plot(brightest_neighbour.x,
                    brightest_neighbour.y, c='r', marker='o')

    brightest_constelation = np.array(
        [[p.x, p.y] for p in brightest_neighbours])
    x, y = brightest_constelation.T
    if debug:
        # plot the brightest setup of lines
        ax.plot(x, y)

    # find the direction to pass to the next letter
    final_x = max(x)
    final_y = min(y)
    direction = [final_x-start_x, final_y-start_y]
    direction = direction / np.linalg.norm(direction)
    return [final_x, final_y], direction, brightest_constelation


#
# GLOBAL vars
space_between_letters = 0.5
debug = True
okay_radius = 0.3

stars = [gen_pt() for _ in range(n_points)]
lookup = KDTree([[p.x, p.y] for p in stars])
start_point = [0, 1]  # pretend bottom left of the previous letter
direction = [1, 0]         # make sure this is magnitude 1

my_bright_letters = []
next_start_point, direction, brightest_constelation = plot_letter_smart(
    L, stars, lookup, start_point=[0, 1], direction=[1, 0], debug=debug)
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
